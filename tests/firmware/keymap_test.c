/*
 * Prueft keymap_de.c ohne Hardware: Zeichen -> Tastenanschlaege -> zurueck in Zeichen
 * (unabhaengige Tabelle der deutschen Windows-Tastatur). Start: tests/firmware/run.sh
 */
/* Unabhaengige Rueckuebersetzung: Taste+Modifier -> Zeichen auf deutscher Windows-Tastatur */
#include <stdio.h>
#include <string.h>
#include "keymap_de.h"
static const char *de(int mod, int key) {
	static char b[8];
	const char *row_n = "1234567890";
	int sh = mod & 2, ag = mod & 0x40;
	if (key >= 4 && key <= 0x1d) {
		char c = 'a' + key - 4; if (c == 'y') c = 'z'; else if (c == 'z') c = 'y';
		if (ag) { if (c=='q') return "@"; if (c=='e') return "€"; if (c=='m') return "µ"; return "?AG"; }
		b[0] = sh ? c - 32 : c; b[1] = 0; return b;
	}
	if (key >= 0x1e && key <= 0x27) {
		int i = key - 0x1e;
		if (ag) { const char *a[] = {0,"²","³",0,0,0,"{","[","]","}"}; return a[i] ? a[i] : "?AG"; }
		if (sh) {
			static const char *shifted[] = { "!", "\"", "§", "$", "%", "&", "/", "(", ")", "=" };
			return shifted[i];
		}
		b[0] = row_n[i]; b[1] = 0; return b;
	}
	switch (key) {
	case 0x2c: return " "; case 0x28: return "\n"; case 0x2b: return "\t";
	case 0x2d: return ag ? "\\" : sh ? "?" : "ß";
	case 0x2e: return sh ? "<DEAD`>" : "<DEAD´>";
	case 0x2f: return sh ? "Ü" : "ü";
	case 0x30: return ag ? "~" : sh ? "*" : "+";
	case 0x32: return sh ? "'" : "#";
	case 0x33: return sh ? "Ö" : "ö";
	case 0x34: return sh ? "Ä" : "ä";
	case 0x35: return sh ? "°" : "<DEAD^>";
	case 0x36: return sh ? ";" : ",";
	case 0x37: return sh ? ":" : ".";
	case 0x38: return sh ? "_" : "-";
	case 0x64: return ag ? "|" : sh ? ">" : "<";
	}
	return "?";
}
static unsigned dec(const char **p) {
	const unsigned char *s = (const unsigned char *)*p; unsigned c = *s++;
	if (c >= 0xf0) { c = ((c&7)<<18)|((s[0]&63)<<12)|((s[1]&63)<<6)|(s[2]&63); s+=3; }
	else if (c >= 0xe0) { c = ((c&15)<<12)|((s[0]&63)<<6)|(s[1]&63); s+=2; }
	else if (c >= 0xc0) { c = ((c&31)<<6)|(s[0]&63); s+=1; }
	*p = (const char *)s; return c;
}
int main(void) {
	const char *in = "Test äöü ÄÖÜ ß @ € {[]} \\ | ~ ^ ° ² ³ µ § 1234567890 !\"$%&/()=?*+#',;.:-_<> AbcXYZxyz é è ê É „x“ – …\n\t";
	const char *p = in; char out[1024] = "";
	while (*p) {
		unsigned cp = dec(&p); struct keystroke ks[KEYMAP_MAX_STROKES];
		int n = keymap_de_lookup(cp, ks);
		if (!n) { strcat(out, "<?>"); continue; }
		for (int i = 0; i < n; i++) strcat(out, de(ks[i].mod, ks[i].key));
	}
	/* Erwartung: Tottasten als <DEAD..>, Typografie ersetzt, Emoji als <?> */
	const char *expect = "Test äöü ÄÖÜ ß @ € {[]} \\ | ~ <DEAD^>  ° ² ³ µ § 1234567890 !\"$%&/()=?*+#',;.:-_<> AbcXYZxyz <DEAD´>e <DEAD`>e <DEAD^>e <DEAD´>E \"x\" - ...\n\t";
	if (strcmp(out, expect) != 0) {
		printf("FEHLER\n erhalten: %s\n erwartet: %s\n", out, expect);
		return 1;
	}
	printf("OK  Deutsche Tastaturbelegung: alle Zeichen korrekt\n");
	return 0;
}
