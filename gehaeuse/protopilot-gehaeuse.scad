// ProtoPilot – Gehäuse für den Nordic nRF52840 Dongle (PCA10059)
//
// Zwei Teile zum Zusammenklipsen: Unterteil (Wanne) und Deckel.
// Dazu optional eine dünne Unterlage, die unter den USB-Stecker geklebt wird,
// falls der Stick im USB-Anschluss wackelt.
//
// Ausgeben: in OpenSCAD "teil" wählen (Customizer) und F6, dann als STL exportieren.
// Maße der Platine aus der Nordic-Zeichnung (User Guide PCA10059, Figure 3), über das
// USB-A-Maß (12,0 mm) skaliert. Vor einer Serie unbedingt einmal probedrucken.

/* [Ausgabe] */
// Welches Teil ausgegeben wird
teil = "alle"; // [alle, unterteil, deckel, unterlage, zusammengebaut]

/* [Platine – nachmessen!] */
// Dicke der Platine (mit Messschieber nachmessen)
pcb_t = 1.6;
// Breite des breiten Teils
pcb_w = 15.23;
// Länge bis zum Beginn der Schräge vor dem USB-Stecker
pcb_body = 29.96;
// Gesamtlänge inkl. USB-Stecker
pcb_len = 45.93;
// Breite des USB-Steckers
usb_w = 12.0;

/* [Gehäuse] */
// Luft zwischen Platine und Wand
spiel = 0.2;
// Wandstärke
wand = 1.4;
// Bodenstärke
boden = 1.2;
// Deckelstärke
deckel_t = 1.2;
// Freiraum über der Platine (Bauteile)
bauteile_h = 2.6;
// Eckenradius außen
radius = 2.4;
// Breite der Öffnung für den USB-Stecker
usb_oeffnung = 12.5;
// Höhe der Klemmkante des Deckels über der Platine (0 = liegt auf)
klemm = 0.0;
// Tiefe der Gravur
gravur = 0.4;
// Schriftart der Gravur
schrift = "Inter Display:style=ExtraBold";
// Unterlage unter dem USB-Stecker (Dicke)
unterlage_t = 0.4;

/* [Bedienung] */
// Loch über dem Taster SW1 (mit Büroklammer drücken)
sw1_loch = 2.4;
// Löcher über den LEDs
led_loch = 1.8;
// Zugang zum seitlichen RESET-Taster (zum Aufspielen der Firmware)
reset_zugang = true;

/* [Hidden] */
$fn = 48;
e = 0.01;

// Positionen auf der Platine (x ab Antennen-Ende, y ab der Kante mit LD1, Bauteilseite oben)
SW1 = [10.61, pcb_w - 4.75];
RESET_Y = pcb_w - 4.77;      // Mitte des seitlichen Tasters
LD1 = [28.12, pcb_w - 11.66];
LD2 = [28.12, pcb_w - 3.57];

// Innenraum
in_x0 = -spiel;
in_y0 = -spiel;
in_y1 = pcb_w + spiel;
// Vorderwand innen: dort ist die Platine (Schräge) schmaler als die Öffnung
front_in = pcb_body + (pcb_w - usb_oeffnung) / 2 + 0.05;
// Außen
ax0 = in_x0 - wand;
ax1 = front_in + wand;
ay0 = in_y0 - wand;
ay1 = in_y1 + wand;
z_teil = pcb_t + bauteile_h;          // Trennebene Unterteil/Deckel
z_oben = z_teil + deckel_t;

// Abgerundetes Rechteck (Draufsicht)
module rrect(x0, y0, x1, y1, r) {
  hull() for (x = [x0 + r, x1 - r], y = [y0 + r, y1 - r]) translate([x, y]) circle(r = r);
}

// Außenform mit gefasten Kanten unten bzw. oben
module schale(z0, z1, fase_unten = 0, fase_oben = 0) {
  hull() {
    translate([0, 0, z0]) linear_extrude(e) offset(delta = -fase_unten) rrect(ax0, ay0, ax1, ay1, radius);
    translate([0, 0, z0 + fase_unten]) linear_extrude(z1 - z0 - fase_unten - fase_oben) rrect(ax0, ay0, ax1, ay1, radius);
    translate([0, 0, z1 - e]) linear_extrude(e) offset(delta = -fase_oben) rrect(ax0, ay0, ax1, ay1, radius);
  }
}

// Papierflieger aus dem Logo (Höhe 1)
module flieger() {
  polygon([[0.9291, 1.0], [0.0, 0.6732], [0.4165, 0.4874]]);
  polygon([[1.0, 0.9291], [0.6732, 0.0], [0.4874, 0.4165]]);
}

// Rastnasen und -nuten an den Längsseiten
rast_x = [6, front_in - 8];
rast_l = 6;
rast_z = z_teil - 1.4;

module unterteil() {
  difference() {
    schale(-boden, z_teil, fase_unten = 0.5);
    // Innenraum
    translate([in_x0, in_y0, 0]) cube([front_in - in_x0, in_y1 - in_y0, z_teil + 1]);
    // Öffnung für den USB-Stecker (oben offen, Platine wird von oben eingelegt)
    translate([front_in - e, pcb_w / 2 - usb_oeffnung / 2, 0]) cube([wand + 1, usb_oeffnung, z_teil + 1]);
    // Rastnuten
    for (x = rast_x, s = [0, 1])
      translate([x, s ? in_y1 - e : in_y0 - 0.4 + e, rast_z]) cube([rast_l + 1, 0.4, 0.8]);
    // RESET-Zugang durch die Rückwand (Schlitz, Büroklammer)
    if (reset_zugang) reset_schlitz();
    // Griffmulde zum Öffnen
    translate([ax0 - 1, 1.0, z_teil - 0.6]) cube([wand + 0.6, 6, 1]);
  }
}

module reset_schlitz() {
  // Schlitz 1,2 mm breit, von der Platinenoberkante bis 1,8 mm darüber (Höhe des Tasters nicht bekannt)
  hull() for (z = [pcb_t + 0.5, pcb_t + 1.2])
    translate([ax0 - 1, RESET_Y, z]) rotate([0, 90, 0]) cylinder(d = 1.2, h = wand + spiel + 2.2);
}

module deckel() {
  schuerze = 0.9;   // Wandstärke der Schürze, die innen in die Wanne greift
  luft = 0.12;      // Spiel zwischen Schürze und Wanne
  sx0 = in_x0 + luft; sy0 = in_y0 + luft; sy1 = in_y1 - luft; sx1 = front_in - luft;
  difference() {
    union() {
      // Deckelplatte
      schale(z_teil, z_oben, fase_oben = 0.6);
      // Schürze rundum, unten liegt sie auf dem Platinenrand auf
      translate([0, 0, pcb_t + klemm]) linear_extrude(z_teil - pcb_t - klemm + e) difference() {
        polygon([[sx0, sy0], [sx1, sy0], [sx1, sy1], [sx0, sy1]]);
        offset(delta = -schuerze) polygon([[sx0, sy0], [sx1, sy0], [sx1, sy1], [sx0, sy1]]);
      }
      // Lasche, die die USB-Öffnung über der Platine schließt
      translate([front_in - e, pcb_w / 2 - usb_oeffnung / 2 + luft, pcb_t + klemm])
        cube([wand + e, usb_oeffnung - 2 * luft, z_teil - pcb_t - klemm + e]);
      // Rastnasen
      for (x = rast_x, s = [0, 1])
        translate([x + 0.5, s ? sy1 : sy0, rast_z + 0.4])
          rotate([0, 90, 0]) cylinder(r = 0.32, h = rast_l - 1, $fn = 16);
    }
    // Taster SW1
    translate([SW1[0], SW1[1], z_teil - 1]) cylinder(d = sw1_loch, h = 5);
    // LEDs
    for (p = [LD1, LD2]) translate([p[0], p[1], z_teil - 1]) cylinder(d = led_loch, h = 5);
    // RESET-Zugang auch durch die Schürze
    if (reset_zugang) reset_schlitz();
    // Gravur: Schriftzug unten, Flieger oben
    translate([0, 0, z_oben - gravur]) linear_extrude(gravur + 1) {
      translate([1.0, LD1[1] - 1.75]) text("ProtoPilot", size = 3.5, font = schrift, halign = "left", valign = "baseline");
      translate([17.2, SW1[1] - 3.0]) scale(6.0) flieger();
    }
    // Ring um das Tasterloch
    translate([SW1[0], SW1[1], z_oben - gravur]) difference() {
      cylinder(d = sw1_loch + 2.2, h = 1);
      translate([0, 0, -1]) cylinder(d = sw1_loch + 1.2, h = 3);
    }
  }
}

// Unterlage unter den USB-Stecker (mit doppelseitigem Klebeband an die Platinenunterseite)
module unterlage() {
  linear_extrude(unterlage_t) rrect(0, 0, 11.0, usb_w - 0.6, 0.8);
}

// Platine zur Kontrolle (nur Ansicht)
module platine() {
  color("green") linear_extrude(pcb_t) polygon([
    [0, 0], [pcb_body, 0], [pcb_body + (pcb_w - usb_w) / 2, (pcb_w - usb_w) / 2],
    [pcb_len, (pcb_w - usb_w) / 2], [pcb_len, (pcb_w + usb_w) / 2],
    [pcb_body + (pcb_w - usb_w) / 2, (pcb_w + usb_w) / 2], [pcb_body, pcb_w], [0, pcb_w]]);
  color("white") translate([SW1[0] - 2.1, SW1[1] - 1.55, pcb_t]) cube([4.2, 3.1, 1.5]);
  color("white") translate([5.11, RESET_Y - 2.0, pcb_t]) cube([2.9, 3.5, 1.4]);
  color("black") translate([5.6, 4.0, pcb_t]) cube([7, 7, 0.85]);
}

// Druckanordnung: Unterteil mit dem Boden nach unten, Deckel umgedreht (Oberseite nach unten)
module deckel_druck() translate([0, ay1 + ay0, z_oben]) rotate([180, 0, 0]) deckel();

if (teil == "unterteil") translate([0, 0, boden]) unterteil();
else if (teil == "deckel") deckel_druck();
else if (teil == "unterlage") unterlage();
else if (teil == "zusammengebaut") { color("#0b6f6a") unterteil(); color("#3fb8ae", 0.9) deckel(); platine(); }
else {
  translate([0, 0, boden]) unterteil();
  translate([0, ay1 - ay0 + 6, 0]) deckel_druck();
  translate([0, -usb_w - 6, 0]) unterlage();
}
