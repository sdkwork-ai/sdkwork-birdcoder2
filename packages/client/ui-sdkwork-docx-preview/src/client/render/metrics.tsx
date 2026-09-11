/**
 * Font metrics the page layout is calibrated against.
 *
 * Word sizes a multiple line spacing from the typeface's own natural line
 * height, which CSS cannot express, so the body probes the ratio once per
 * font and hands it to the views through this context. The default answers 1,
 * which keeps a viewer without layout working in plain unitless terms.
 */
import { createContext } from 'react'

/** The factory the context carries: font-family list to natural ratio. */
export type LineRatioOf = (fontFamily: string) => number

/** React context holding the ratio reader. */
export const LineRatioContext = createContext<LineRatioOf>(() => 1)
