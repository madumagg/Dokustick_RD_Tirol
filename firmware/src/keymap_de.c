#include "keymap_de.h"

#include <zephyr/usb/class/hid.h>

#define S HID_KBD_MODIFIER_LEFT_SHIFT
#define A HID_KBD_MODIFIER_RIGHT_ALT /* AltGr */

/* HID-Usage-IDs der Tasten (Position auf der Tastatur) */
#define K_SPACE   0x2C
#define K_ENTER   0x28
#define K_TAB     0x2B
#define K_1       0x1E
#define K_0       0x27
#define K_SZ      0x2D /* ß ? \ */
#define K_ACUTE   0x2E /* ´ ` (Tottaste) */
#define K_UE      0x2F
#define K_PLUS    0x30 /* + * ~ */
#define K_HASH    0x32 /* # ' */
#define K_OE      0x33
#define K_AE      0x34
#define K_CARET   0x35 /* ^ ° (Tottaste) */
#define K_COMMA   0x36
#define K_DOT     0x37
#define K_MINUS   0x38
#define K_LESS    0x64 /* < > | */

#define KEY(c) (0x04 + ((c) - 'a'))

/* Taste fuer einen Kleinbuchstaben; Y und Z sind bei QWERTZ vertauscht */
static uint8_t letter_key(char c)
{
	if (c == 'y') {
		return KEY('z');
	}
	if (c == 'z') {
		return KEY('y');
	}
	return KEY(c);
}

static int one(struct keystroke *out, uint8_t mod, uint8_t key)
{
	out[0] = (struct keystroke){ .mod = mod, .key = key };
	return 1;
}

/* Tottaste gefolgt von Leerzeichen ergibt das Zeichen selbst */
static int dead(struct keystroke *out, uint8_t mod, uint8_t key)
{
	out[0] = (struct keystroke){ .mod = mod, .key = key };
	out[1] = (struct keystroke){ .key = K_SPACE };
	return 2;
}

/* Tottaste gefolgt von einem Vokal, z.B. ´ + e = é */
static int accent(struct keystroke *out, uint8_t mod, uint8_t key, char base, bool upper)
{
	out[0] = (struct keystroke){ .mod = mod, .key = key };
	out[1] = (struct keystroke){ .mod = upper ? S : 0, .key = letter_key(base), .caps = true };
	return 2;
}

static int lookup_ascii(char c, struct keystroke *out)
{
	if (c >= 'a' && c <= 'z') {
		out[0] = (struct keystroke){ .key = letter_key(c), .caps = true };
		return 1;
	}
	if (c >= 'A' && c <= 'Z') {
		out[0] = (struct keystroke){ .mod = S, .key = letter_key(c - 'A' + 'a'), .caps = true };
		return 1;
	}
	if (c >= '1' && c <= '9') {
		return one(out, 0, K_1 + (c - '1'));
	}

	switch (c) {
	case '0': return one(out, 0, K_0);
	case ' ': return one(out, 0, K_SPACE);
	case '\n': return one(out, 0, K_ENTER);
	case '\t': return one(out, 0, K_TAB);
	case '!': return one(out, S, K_1);
	case '"': return one(out, S, K_1 + 1);
	case '$': return one(out, S, K_1 + 3);
	case '%': return one(out, S, K_1 + 4);
	case '&': return one(out, S, K_1 + 5);
	case '/': return one(out, S, K_1 + 6);
	case '(': return one(out, S, K_1 + 7);
	case ')': return one(out, S, K_1 + 8);
	case '=': return one(out, S, K_0);
	case '{': return one(out, A, K_1 + 6);
	case '[': return one(out, A, K_1 + 7);
	case ']': return one(out, A, K_1 + 8);
	case '}': return one(out, A, K_0);
	case '?': return one(out, S, K_SZ);
	case '\\': return one(out, A, K_SZ);
	case '+': return one(out, 0, K_PLUS);
	case '*': return one(out, S, K_PLUS);
	case '~': return one(out, A, K_PLUS);
	case '#': return one(out, 0, K_HASH);
	case '\'': return one(out, S, K_HASH);
	case ',': return one(out, 0, K_COMMA);
	case ';': return one(out, S, K_COMMA);
	case '.': return one(out, 0, K_DOT);
	case ':': return one(out, S, K_DOT);
	case '-': return one(out, 0, K_MINUS);
	case '_': return one(out, S, K_MINUS);
	case '<': return one(out, 0, K_LESS);
	case '>': return one(out, S, K_LESS);
	case '|': return one(out, A, K_LESS);
	case '@': return one(out, A, KEY('q'));
	case '^': return dead(out, 0, K_CARET);
	case '`': return dead(out, S, K_ACUTE);
	default: return 0;
	}
}

int keymap_de_lookup(uint32_t cp, struct keystroke out[KEYMAP_MAX_STROKES])
{
	for (int i = 0; i < KEYMAP_MAX_STROKES; i++) {
		out[i] = (struct keystroke){ 0 };
	}

	if (cp < 0x80) {
		return lookup_ascii((char)cp, out);
	}

	switch (cp) {
	case 0x00E4: out[0] = (struct keystroke){ 0, K_AE, true }; return 1;  /* ä */
	case 0x00C4: out[0] = (struct keystroke){ S, K_AE, true }; return 1;  /* Ä */
	case 0x00F6: out[0] = (struct keystroke){ 0, K_OE, true }; return 1;  /* ö */
	case 0x00D6: out[0] = (struct keystroke){ S, K_OE, true }; return 1;  /* Ö */
	case 0x00FC: out[0] = (struct keystroke){ 0, K_UE, true }; return 1;  /* ü */
	case 0x00DC: out[0] = (struct keystroke){ S, K_UE, true }; return 1;  /* Ü */
	case 0x00DF: return one(out, 0, K_SZ);         /* ß */
	case 0x00A7: return one(out, S, K_1 + 2);      /* § */
	case 0x00B0: return one(out, S, K_CARET);      /* ° */
	case 0x00B2: return one(out, A, K_1 + 1);      /* ² */
	case 0x00B3: return one(out, A, K_1 + 2);      /* ³ */
	case 0x20AC: return one(out, A, KEY('e'));     /* € */
	case 0x00B5: return one(out, A, KEY('m'));     /* µ */
	case 0x03BC: return one(out, A, KEY('m'));     /* μ (griech. my) */
	case 0x00B4: return dead(out, 0, K_ACUTE);     /* ´ */

	case 0x00E1: return accent(out, 0, K_ACUTE, 'a', false); /* á */
	case 0x00E9: return accent(out, 0, K_ACUTE, 'e', false); /* é */
	case 0x00ED: return accent(out, 0, K_ACUTE, 'i', false); /* í */
	case 0x00F3: return accent(out, 0, K_ACUTE, 'o', false); /* ó */
	case 0x00FA: return accent(out, 0, K_ACUTE, 'u', false); /* ú */
	case 0x00C1: return accent(out, 0, K_ACUTE, 'a', true);  /* Á */
	case 0x00C9: return accent(out, 0, K_ACUTE, 'e', true);  /* É */
	case 0x00CD: return accent(out, 0, K_ACUTE, 'i', true);  /* Í */
	case 0x00D3: return accent(out, 0, K_ACUTE, 'o', true);  /* Ó */
	case 0x00DA: return accent(out, 0, K_ACUTE, 'u', true);  /* Ú */
	case 0x00E0: return accent(out, S, K_ACUTE, 'a', false); /* à */
	case 0x00E8: return accent(out, S, K_ACUTE, 'e', false); /* è */
	case 0x00EC: return accent(out, S, K_ACUTE, 'i', false); /* ì */
	case 0x00F2: return accent(out, S, K_ACUTE, 'o', false); /* ò */
	case 0x00F9: return accent(out, S, K_ACUTE, 'u', false); /* ù */
	case 0x00E2: return accent(out, 0, K_CARET, 'a', false); /* â */
	case 0x00EA: return accent(out, 0, K_CARET, 'e', false); /* ê */
	case 0x00EE: return accent(out, 0, K_CARET, 'i', false); /* î */
	case 0x00F4: return accent(out, 0, K_CARET, 'o', false); /* ô */
	case 0x00FB: return accent(out, 0, K_CARET, 'u', false); /* û */

	/* Typografische Zeichen auf tippbare Entsprechungen abbilden */
	case 0x00A0: /* geschuetztes Leerzeichen */
	case 0x202F:
	case 0x2009:
		return one(out, 0, K_SPACE);
	case 0x201C: case 0x201D: case 0x201E: /* “ ” „ */
		return one(out, S, K_1 + 1);
	case 0x2018: case 0x2019: case 0x201A: /* ‘ ’ ‚ */
		return one(out, S, K_HASH);
	case 0x2013: case 0x2014: case 0x2212: /* – — − */
		return one(out, 0, K_MINUS);
	case 0x2026: /* … */
		for (int i = 0; i < 3; i++) {
			out[i] = (struct keystroke){ .key = K_DOT };
		}
		return 3;
	default:
		return 0;
	}
}
