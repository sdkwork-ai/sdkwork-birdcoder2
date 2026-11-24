#pragma once

/**
 * Product name the native installer helper draws.
 *
 * The NSIS build writes `installer-product.h` from the selected brand manifest
 * next to the compiled helper, so one source tree serves every brand. A compile
 * that carries no generated header (a bare checkout, a unit build) keeps the
 * shipped brand rather than failing.
 */
#if __has_include("installer-product.h")
#include "installer-product.h"
#else
#define DSH_INSTALLER_PRODUCT_NAME L"BirdCoder"
#endif
