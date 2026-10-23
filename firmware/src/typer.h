/*
 * Tipp-Engine: nimmt Text (UTF-8) entgegen und tippt ihn ueber USB-HID ein.
 *
 * Datenstrom-Format:
 *   UTF-8-Text                  wird als Text getippt ('\n' = Enter, '\t' = Tab)
 *   0x00 <mod> <key>            einzelner Tastenanschlag (HID-Modifier + Usage-ID)
 *   0x00 0xFF <n>               Pause von n * 10 ms
 */
#ifndef TYPER_H_
#define TYPER_H_

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define TYPER_QUEUE_SIZE 4096

int typer_init(void);

/* Haengt Daten an die Warteschlange an. -ENOMEM, wenn nicht genug Platz ist. */
int typer_put(const uint8_t *data, size_t len);

/* Bricht das Tippen ab und leert die Warteschlange. */
void typer_cancel(void);

void typer_set_delay(uint8_t ms);
uint8_t typer_get_delay(void);

uint32_t typer_pending(void);
uint32_t typer_free(void);
bool typer_busy(void);
bool typer_usb_ready(void);
bool typer_caps_lock(void);

#endif
