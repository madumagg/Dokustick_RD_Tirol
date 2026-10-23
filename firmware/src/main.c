/*
 * DokuStick: Bluetooth-zu-USB-Tastatur fuer nRF52840-Dongles
 * (Nordic PCA10059, Makerdiary nRF52840 MDK USB Dongle).
 *
 * Das Smartphone verbindet sich per Bluetooth LE und schickt Text,
 * der Dongle tippt ihn als USB-Tastatur am Zielgeraet ein.
 *
 * Kopplung: nach dem Einstecken (bzw. Neustart) 60 s moeglich, LED blinkt blau.
 * Nordic-Dongle zusaetzlich mit Taste SW1:
 *             kurz druecken   -> Kopplungsmodus fuer 60 s
 *             5 s halten      -> alle Kopplungen loeschen (LED leuchtet rot)
 */
#include "typer.h"

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/kernel.h>
#include <zephyr/settings/settings.h>
#include <zephyr/sys/byteorder.h>

#define FW_VERSION 2

#define PAIRING_WINDOW_MS   (60 * 1000)
#define ERASE_HOLD_MS       5000
#define STATUS_INTERVAL_MS  150

/* Befehle auf der Befehls-Charakteristik (erstes Byte) */
#define CMD_DATA      0x01 /* Datenstrom, siehe typer.h */
#define CMD_CANCEL    0x02 /* Tippen abbrechen */
#define CMD_DELAY     0x03 /* Tippverzoegerung in ms setzen */
#define CMD_UNPAIR    0x04 /* alle Kopplungen loeschen */

/* ATT-Anwendungsfehler: Warteschlange voll, spaeter erneut senden */
#define ERR_QUEUE_FULL 0x80

#define STATUS_USB_READY  BIT(0)
#define STATUS_CAPS_LOCK  BIT(1)
#define STATUS_TYPING     BIT(2)
#define STATUS_PAIRING    BIT(3)

#define BT_UUID_DS_SVC_VAL    BT_UUID_128_ENCODE(0x6e7a0001, 0x4b3c, 0x4f8e, 0x9a1d, 0x5c2b7d0a4e01)
#define BT_UUID_DS_CMD_VAL    BT_UUID_128_ENCODE(0x6e7a0002, 0x4b3c, 0x4f8e, 0x9a1d, 0x5c2b7d0a4e01)
#define BT_UUID_DS_STATUS_VAL BT_UUID_128_ENCODE(0x6e7a0003, 0x4b3c, 0x4f8e, 0x9a1d, 0x5c2b7d0a4e01)

static const struct bt_uuid_128 ds_svc_uuid = BT_UUID_INIT_128(BT_UUID_DS_SVC_VAL);
static const struct bt_uuid_128 ds_cmd_uuid = BT_UUID_INIT_128(BT_UUID_DS_CMD_VAL);
static const struct bt_uuid_128 ds_status_uuid = BT_UUID_INIT_128(BT_UUID_DS_STATUS_VAL);

#define HAS_BUTTON DT_NODE_EXISTS(DT_ALIAS(ds_button))

#if HAS_BUTTON
static const struct gpio_dt_spec btn = GPIO_DT_SPEC_GET(DT_ALIAS(ds_button), gpios);
#endif
static const struct gpio_dt_spec led_red = GPIO_DT_SPEC_GET(DT_ALIAS(ds_red), gpios);
static const struct gpio_dt_spec led_green = GPIO_DT_SPEC_GET(DT_ALIAS(ds_green), gpios);
static const struct gpio_dt_spec led_blue = GPIO_DT_SPEC_GET(DT_ALIAS(ds_blue), gpios);

static struct bt_conn *current_conn;
static atomic_t secured;
static atomic_t notify_enabled;
static atomic_t erasing;
/* Nach dem Einstecken ist das Kopplungsfenster offen */
static int64_t pairing_until = PAIRING_WINDOW_MS;

struct status {
	uint8_t flags;
	uint16_t pending;
	uint16_t free;
	uint8_t delay;
	uint8_t version;
} __packed;

static struct status last_status;

/* --- Kopplung -------------------------------------------------------- */

static void count_bond(const struct bt_bond_info *info, void *user_data)
{
	(*(int *)user_data)++;
}

static int bond_count(void)
{
	int n = 0;

	bt_foreach_bond(BT_ID_DEFAULT, count_bond, &n);
	return n;
}

/* Koppeln ist nur ohne Kopplungen oder im Kopplungsfenster erlaubt */
static bool pairing_allowed(void)
{
	return bond_count() == 0 || k_uptime_get() < pairing_until;
}

static enum bt_security_err pairing_accept(struct bt_conn *conn,
					   const struct bt_conn_pairing_feat *const feat)
{
	return pairing_allowed() ? BT_SECURITY_ERR_SUCCESS : BT_SECURITY_ERR_PAIR_NOT_ALLOWED;
}

static void pairing_complete(struct bt_conn *conn, bool bonded)
{
	pairing_until = 0;
}

static struct bt_conn_auth_cb auth_cb = {
	.pairing_accept = pairing_accept,
};

static struct bt_conn_auth_info_cb auth_info_cb = {
	.pairing_complete = pairing_complete,
};

/* --- Status ---------------------------------------------------------- */

static struct status build_status(void)
{
	struct status s = {
		.flags = (typer_usb_ready() ? STATUS_USB_READY : 0) |
			 (typer_caps_lock() ? STATUS_CAPS_LOCK : 0) |
			 (typer_busy() ? STATUS_TYPING : 0) |
			 (pairing_allowed() ? STATUS_PAIRING : 0),
		.pending = sys_cpu_to_le16(MIN(typer_pending(), UINT16_MAX)),
		.free = sys_cpu_to_le16(MIN(typer_free(), UINT16_MAX)),
		.delay = typer_get_delay(),
		.version = FW_VERSION,
	};
	return s;
}

static ssize_t status_read(struct bt_conn *conn, const struct bt_gatt_attr *attr, void *buf,
			   uint16_t len, uint16_t offset)
{
	struct status s = build_status();

	return bt_gatt_attr_read(conn, attr, buf, len, offset, &s, sizeof(s));
}

static void status_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
	atomic_set(&notify_enabled, value == BT_GATT_CCC_NOTIFY);
}

static ssize_t cmd_write(struct bt_conn *conn, const struct bt_gatt_attr *attr, const void *buf,
			 uint16_t len, uint16_t offset, uint8_t flags);
static struct k_work erase_bonds_work;

BT_GATT_SERVICE_DEFINE(ds_svc,
	BT_GATT_PRIMARY_SERVICE(&ds_svc_uuid),
	BT_GATT_CHARACTERISTIC(&ds_cmd_uuid.uuid,
			       BT_GATT_CHRC_WRITE | BT_GATT_CHRC_WRITE_WITHOUT_RESP,
			       BT_GATT_PERM_WRITE_ENCRYPT, NULL, cmd_write, NULL),
	BT_GATT_CHARACTERISTIC(&ds_status_uuid.uuid,
			       BT_GATT_CHRC_READ | BT_GATT_CHRC_NOTIFY,
			       BT_GATT_PERM_READ_ENCRYPT, status_read, NULL, NULL),
	BT_GATT_CCC(status_ccc_changed, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE_ENCRYPT),
);

static ssize_t cmd_write(struct bt_conn *conn, const struct bt_gatt_attr *attr, const void *buf,
			 uint16_t len, uint16_t offset, uint8_t flags)
{
	const uint8_t *data = buf;

	if (offset != 0) {
		return BT_GATT_ERR(BT_ATT_ERR_INVALID_OFFSET);
	}
	if (len < 1) {
		return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
	}

	switch (data[0]) {
	case CMD_DATA:
		if (typer_put(data + 1, len - 1) != 0) {
			return BT_GATT_ERR(ERR_QUEUE_FULL);
		}
		break;
	case CMD_CANCEL:
		typer_cancel();
		break;
	case CMD_DELAY:
		if (len < 2) {
			return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
		}
		typer_set_delay(data[1]);
		break;
	case CMD_UNPAIR:
		atomic_set(&erasing, 1);
		k_work_submit(&erase_bonds_work);
		break;
	default:
		return BT_GATT_ERR(BT_ATT_ERR_NOT_SUPPORTED);
	}
	return len;
}

static void status_work_handler(struct k_work *work);
static K_WORK_DELAYABLE_DEFINE(status_work, status_work_handler);

static void status_work_handler(struct k_work *work)
{
	struct status s = build_status();

	if (current_conn && atomic_get(&notify_enabled) &&
	    memcmp(&s, &last_status, sizeof(s)) != 0) {
		if (bt_gatt_notify(current_conn, &ds_svc.attrs[3], &s, sizeof(s)) == 0) {
			last_status = s;
		}
	}
	if (current_conn) {
		k_work_schedule(&status_work, K_MSEC(STATUS_INTERVAL_MS));
	}
}

/* --- Verbindung & Advertising ---------------------------------------- */

static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA_BYTES(BT_DATA_UUID128_ALL, BT_UUID_DS_SVC_VAL),
};

static const struct bt_data sd[] = {
	BT_DATA(BT_DATA_NAME_COMPLETE, CONFIG_BT_DEVICE_NAME, sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

static void adv_work_handler(struct k_work *work)
{
	bt_le_adv_start(BT_LE_ADV_CONN, ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));
}
static K_WORK_DEFINE(adv_work, adv_work_handler);

static void connected(struct bt_conn *conn, uint8_t err)
{
	if (err) {
		return;
	}
	current_conn = bt_conn_ref(conn);
	memset(&last_status, 0xFF, sizeof(last_status));
	k_work_schedule(&status_work, K_MSEC(STATUS_INTERVAL_MS));
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
	if (current_conn) {
		bt_conn_unref(current_conn);
		current_conn = NULL;
	}
	atomic_set(&secured, 0);
	atomic_set(&notify_enabled, 0);
}

static void security_changed(struct bt_conn *conn, bt_security_t level, enum bt_security_err err)
{
	atomic_set(&secured, !err && level >= BT_SECURITY_L2);
}

static void recycled(void)
{
	k_work_submit(&adv_work);
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
	.connected = connected,
	.disconnected = disconnected,
	.security_changed = security_changed,
	.recycled = recycled,
};

static void erase_bonds_work_handler(struct k_work *work)
{
	if (current_conn) {
		bt_conn_disconnect(current_conn, BT_HCI_ERR_REMOTE_USER_TERM_CONN);
	}
	bt_unpair(BT_ID_DEFAULT, NULL);
	atomic_set(&erasing, 0);
}
static K_WORK_DEFINE(erase_bonds_work, erase_bonds_work_handler);

/* --- Taste & LEDs ---------------------------------------------------- */

static void leds(bool r, bool g, bool b)
{
	gpio_pin_set_dt(&led_red, r);
	gpio_pin_set_dt(&led_green, g);
	gpio_pin_set_dt(&led_blue, b);
}

static void ui_loop(void)
{
	int64_t pressed_at = -1;
	uint32_t tick = 0;

	for (;;) {
		int64_t now = k_uptime_get();
		bool blink = (tick / 5) % 2; /* 500 ms Takt */
		bool fast = tick % 2;        /* 100 ms Takt */

#if HAS_BUTTON
		bool down = gpio_pin_get_dt(&btn) > 0;

		/* Taste auswerten */
		if (down && pressed_at < 0) {
			pressed_at = now;
		} else if (!down && pressed_at >= 0) {
			int64_t held = now - pressed_at;

			if (held >= ERASE_HOLD_MS) {
				atomic_set(&erasing, 1);
				k_work_submit(&erase_bonds_work);
			} else if (held >= 30) {
				pairing_until = now + PAIRING_WINDOW_MS;
			}
			pressed_at = -1;
		}
#endif

		/* LED-Anzeige */
		if (atomic_get(&erasing) || (pressed_at >= 0 && now - pressed_at >= ERASE_HOLD_MS)) {
			leds(true, false, false);         /* rot: Kopplungen loeschen */
		} else if (typer_busy() && !typer_usb_ready()) {
			leds(blink, false, false);        /* rot blinkend: kein USB */
		} else if (typer_busy()) {
			leds(false, fast, false);         /* gruen flackernd: tippt */
		} else if (pairing_allowed() && !atomic_get(&secured)) {
			leds(false, false, blink);        /* blau blinkend: koppelbereit */
		} else if (atomic_get(&secured)) {
			leds(false, true, false);         /* gruen: verbunden */
		} else {
			leds(false, false, false);
		}

		tick++;
		k_msleep(100);
	}
}

int main(void)
{
#if HAS_BUTTON
	gpio_pin_configure_dt(&btn, GPIO_INPUT);
#endif
	gpio_pin_configure_dt(&led_red, GPIO_OUTPUT_INACTIVE);
	gpio_pin_configure_dt(&led_green, GPIO_OUTPUT_INACTIVE);
	gpio_pin_configure_dt(&led_blue, GPIO_OUTPUT_INACTIVE);

	if (typer_init() != 0) {
		leds(true, false, false);
	}

	bt_conn_auth_cb_register(&auth_cb);
	bt_conn_auth_info_cb_register(&auth_info_cb);

	if (bt_enable(NULL) == 0) {
		settings_load();
		k_work_submit(&adv_work);
	} else {
		leds(true, false, false);
	}

	ui_loop();
	return 0;
}
