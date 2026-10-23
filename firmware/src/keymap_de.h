/*
 * Deutsche Tastaturbelegung (QWERTZ, Windows/Linux) fuer USB-HID.
 */
#ifndef KEYMAP_DE_H_
#define KEYMAP_DE_H_

#include <stdbool.h>
#include <stdint.h>

#define KEYMAP_MAX_STROKES 3

struct keystroke {
	uint8_t mod;
	uint8_t key;
	/* Buchstabe, der von der Feststelltaste (Caps Lock) beeinflusst wird */
	bool caps;
};

/*
 * Liefert die Tastenanschlaege fuer ein Unicode-Zeichen.
 * Rueckgabe: Anzahl der Anschlaege (0 = Zeichen nicht tippbar).
 */
int keymap_de_lookup(uint32_t cp, struct keystroke out[KEYMAP_MAX_STROKES]);

#endif
