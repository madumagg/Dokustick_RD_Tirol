cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(dokustick)

target_sources(app PRIVATE
	src/main.c
	src/typer.c
	src/keymap_de.c
)

if(CONFIG_BOARD_NRF52840_MDK_USB_DONGLE)
	target_sources(app PRIVATE src/regout.c)
endif()
