#include "typer.h"
#include "keymap_de.h"

#include <errno.h>
#include <zephyr/device.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/ring_buffer.h>
#include <zephyr/usb/class/usb_hid.h>
#include <zephyr/usb/usb_device.h>

#define DEFAULT_DELAY_MS 5
#define MAX_DELAY_MS     100
#define ESCAPE           0x00
#define ESCAPE_PAUSE     0xFF

static const uint8_t hid_report_desc[] = HID_KEYBOARD_REPORT_DESC();

static const struct device *hid_dev;
static K_SEM_DEFINE(ep_sem, 0, 1);
static K_SEM_DEFINE(data_sem, 0, 1);
static struct k_spinlock queue_lock;
RING_BUF_DECLARE(queue, TYPER_QUEUE_SIZE);

static atomic_t usb_ready;
static atomic_t caps_lock;
static atomic_t busy;
static atomic_t cancel_req;
static atomic_t delay_ms = ATOMIC_INIT(DEFAULT_DELAY_MS);

/* --- USB ------------------------------------------------------------- */

static void usb_status_cb(enum usb_dc_status_code status, const uint8_t *param)
{
	switch (status) {
	case USB_DC_CONFIGURED:
	case USB_DC_RESUME:
		atomic_set(&usb_ready, 1);
		break;
	case USB_DC_RESET:
	case USB_DC_DISCONNECTED:
	case USB_DC_SUSPEND:
		atomic_set(&usb_ready, 0);
		break;
	default:
		break;
	}
}

static void int_in_ready_cb(const struct device *dev)
{
	k_sem_give(&ep_sem);
}

/* Der Host meldet den Zustand der Tastatur-LEDs (Num/Caps/Scroll Lock) */
static int set_report_cb(const struct device *dev, struct usb_setup_packet *setup,
			 int32_t *len, uint8_t **data)
{
	if (*len >= 1) {
		atomic_set(&caps_lock, ((*data)[0] & HID_KBD_LED_CAPS_LOCK) != 0);
	}
	return 0;
}

static const struct hid_ops hid_ops = {
	.int_in_ready = int_in_ready_cb,
	.set_report = set_report_cb,
};

static int hid_send(uint8_t mod, uint8_t key)
{
	uint8_t report[8] = { mod, 0, key, 0, 0, 0, 0, 0 };
	int err;

	k_sem_reset(&ep_sem);
	err = hid_int_ep_write(hid_dev, report, sizeof(report), NULL);
	if (err) {
		return err;
	}
	return k_sem_take(&ep_sem, K_MSEC(100));
}

/* --- Tippen ---------------------------------------------------------- */

static bool cancelled(void)
{
	return atomic_get(&cancel_req) != 0;
}

/* Wartet, bis der Host die Tastatur eingebunden hat. */
static bool wait_usb(void)
{
	while (!atomic_get(&usb_ready)) {
		if (cancelled()) {
			return false;
		}
		k_msleep(50);
	}
	return true;
}

static void pause_ms(uint32_t ms)
{
	k_msleep(ms);
}

static void press(uint8_t mod, uint8_t key)
{
	uint32_t d = atomic_get(&delay_ms);

	if (!wait_usb()) {
		return;
	}

	/*
	 * Modifier zuerst allein senden: manche Programme (z.B. Remote-Desktop)
	 * verlieren sonst Shift/AltGr, wenn es im selben Report wie die Taste kommt.
	 */
	if (mod) {
		hid_send(mod, 0);
		pause_ms(d);
	}
	hid_send(mod, key);
	pause_ms(d);
	if (mod) {
		hid_send(mod, 0);
		pause_ms(d);
	}
	hid_send(0, 0);
	pause_ms(d);
}

static void type_codepoint(uint32_t cp)
{
	struct keystroke ks[KEYMAP_MAX_STROKES];
	int n = keymap_de_lookup(cp, ks);

	for (int i = 0; i < n && !cancelled(); i++) {
		uint8_t mod = ks[i].mod;

		/* Bei aktiver Feststelltaste Shift umkehren, damit Gross/Klein stimmt */
		if (ks[i].caps && atomic_get(&caps_lock)) {
			mod ^= HID_KBD_MODIFIER_LEFT_SHIFT;
		}
		press(mod, ks[i].key);
	}
}

static bool queue_get(uint8_t *b)
{
	k_spinlock_key_t key = k_spin_lock(&queue_lock);
	bool ok = ring_buf_get(&queue, b, 1) == 1;

	k_spin_unlock(&queue_lock, key);
	return ok;
}

static void typer_thread(void *p1, void *p2, void *p3)
{
	/* Zustand des Decoders */
	uint32_t cp = 0;
	int utf8_left = 0;
	int esc_state = 0;
	uint8_t esc_mod = 0;
	uint8_t b;

	for (;;) {
		if (atomic_cas(&cancel_req, 1, 0)) {
			utf8_left = 0;
			esc_state = 0;
			if (atomic_get(&usb_ready)) {
				hid_send(0, 0);
			}
		}

		if (!queue_get(&b)) {
			atomic_set(&busy, 0);
			k_sem_take(&data_sem, K_FOREVER);
			continue;
		}
		atomic_set(&busy, 1);

		if (esc_state == 1) {
			esc_mod = b;
			esc_state = 2;
			continue;
		}
		if (esc_state == 2) {
			esc_state = 0;
			if (esc_mod == ESCAPE_PAUSE) {
				pause_ms(b * 10U);
			} else {
				press(esc_mod, b);
			}
			continue;
		}
		if (b == ESCAPE) {
			esc_state = 1;
			utf8_left = 0;
			continue;
		}

		/* UTF-8 dekodieren */
		if (b < 0x80) {
			utf8_left = 0;
			type_codepoint(b);
		} else if ((b & 0xC0) == 0x80) {
			if (utf8_left > 0) {
				cp = (cp << 6) | (b & 0x3F);
				if (--utf8_left == 0) {
					type_codepoint(cp);
				}
			}
		} else if ((b & 0xE0) == 0xC0) {
			cp = b & 0x1F;
			utf8_left = 1;
		} else if ((b & 0xF0) == 0xE0) {
			cp = b & 0x0F;
			utf8_left = 2;
		} else if ((b & 0xF8) == 0xF0) {
			cp = b & 0x07;
			utf8_left = 3;
		} else {
			utf8_left = 0;
		}
	}
}

K_THREAD_DEFINE(typer_tid, 1536, typer_thread, NULL, NULL, NULL, 5, 0, 0);

/* --- Oeffentliche Schnittstelle --------------------------------------- */

int typer_init(void)
{
	hid_dev = device_get_binding("HID_0");
	if (hid_dev == NULL) {
		return -ENODEV;
	}

	usb_hid_register_device(hid_dev, hid_report_desc, sizeof(hid_report_desc), &hid_ops);
	usb_hid_init(hid_dev);
	return usb_enable(usb_status_cb);
}

int typer_put(const uint8_t *data, size_t len)
{
	k_spinlock_key_t key = k_spin_lock(&queue_lock);
	int ret = 0;

	if (ring_buf_space_get(&queue) < len) {
		ret = -ENOMEM;
	} else {
		ring_buf_put(&queue, data, len);
	}
	k_spin_unlock(&queue_lock, key);

	if (ret == 0 && len > 0) {
		atomic_set(&busy, 1);
		k_sem_give(&data_sem);
	}
	return ret;
}

void typer_cancel(void)
{
	k_spinlock_key_t key = k_spin_lock(&queue_lock);

	ring_buf_reset(&queue);
	k_spin_unlock(&queue_lock, key);
	atomic_set(&cancel_req, 1);
	k_sem_give(&data_sem);
}

void typer_set_delay(uint8_t ms)
{
	atomic_set(&delay_ms, CLAMP(ms, 1, MAX_DELAY_MS));
}

uint8_t typer_get_delay(void)
{
	return atomic_get(&delay_ms);
}

uint32_t typer_pending(void)
{
	k_spinlock_key_t key = k_spin_lock(&queue_lock);
	uint32_t n = ring_buf_size_get(&queue);

	k_spin_unlock(&queue_lock, key);
	return n;
}

uint32_t typer_free(void)
{
	return TYPER_QUEUE_SIZE - typer_pending();
}

bool typer_busy(void)
{
	return atomic_get(&busy) != 0;
}

bool typer_usb_ready(void)
{
	return atomic_get(&usb_ready) != 0;
}

bool typer_caps_lock(void)
{
	return atomic_get(&caps_lock) != 0;
}
