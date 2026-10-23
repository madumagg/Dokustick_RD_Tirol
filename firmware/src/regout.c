/*
 * Beim Makerdiary-Dongle liegt die GPIO-Spannung bei USB-Versorgung
 * standardmaessig bei 1,8 V. Das reicht nicht fuer die gruene und blaue LED,
 * daher einmalig auf 3,3 V umstellen (wie board.c des Nordic-Dongles).
 */
#include <zephyr/init.h>
#include <hal/nrf_power.h>

static int regout_init(void)
{
	if (nrf_power_mainregstatus_get(NRF_POWER) == NRF_POWER_MAINREGSTATUS_HIGH &&
	    (NRF_UICR->REGOUT0 & UICR_REGOUT0_VOUT_Msk) ==
		    (UICR_REGOUT0_VOUT_DEFAULT << UICR_REGOUT0_VOUT_Pos)) {
		NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Wen << NVMC_CONFIG_WEN_Pos;
		while (NRF_NVMC->READY == NVMC_READY_READY_Busy) {
		}
		NRF_UICR->REGOUT0 = (NRF_UICR->REGOUT0 & ~((uint32_t)UICR_REGOUT0_VOUT_Msk)) |
				    (UICR_REGOUT0_VOUT_3V3 << UICR_REGOUT0_VOUT_Pos);
		NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Ren << NVMC_CONFIG_WEN_Pos;
		while (NRF_NVMC->READY == NVMC_READY_READY_Busy) {
		}
		/* Aenderung wird erst nach einem Neustart wirksam */
		NVIC_SystemReset();
	}
	return 0;
}

SYS_INIT(regout_init, PRE_KERNEL_1, CONFIG_KERNEL_INIT_PRIORITY_DEFAULT);
