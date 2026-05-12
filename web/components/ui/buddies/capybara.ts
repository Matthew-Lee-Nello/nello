/**
 * Capybara buddy — ASCII frames ported from
 * https://github.com/anthropics/claude-desktop-buddy/blob/main/src/buddies/capybara.cpp
 * Copyright 2026 Anthropic, PBC — MIT License.
 *
 * Each pose is a 12-wide × 5-tall ASCII grid. Sequence below is the idle
 * SEQ array from the source, expanded into a frame list the component
 * cycles through.
 */

const REST    = "            \n  n______n  \n ( o    o ) \n (   oo   ) \n  `------'  "
const LOOK_L  = "            \n  n______n  \n (o     o ) \n (   oo   ) \n  `------'  "
const LOOK_R  = "            \n  n______n  \n ( o     o) \n (   oo   ) \n  `------'  "
const LOOK_U  = "            \n  n______n  \n ( ^    ^ ) \n (   oo   ) \n  `------'  "
const BLINK   = "            \n  n______n  \n ( -    - ) \n (   oo   ) \n  `------'  "
const EAR_TW  = "            \n  ^______n  \n ( o    o ) \n (   oo   ) \n  `------'  "
const CHEW_A  = "            \n  n______n  \n ( o    o ) \n (   ww   ) \n  `------'  "
const CHEW_B  = "            \n  n______n  \n ( o    o ) \n (   WW   ) \n  `------'  "
const YAWN_I  = "            \n  n______n  \n ( -    - ) \n (   OO   ) \n  `------'  "
const STRETCH = "            \n /n______n\\ \n/( o    o )\\\n (   oo   ) \n  `------'  "

const POSES = [REST, LOOK_L, LOOK_R, LOOK_U, BLINK, EAR_TW, CHEW_A, CHEW_B, YAWN_I, STRETCH]

const IDLE_SEQ = [
  0,0,0,1,0,2,0,4,
  0,5,0,0,
  6,7,6,7,
  0,0,3,3,0,4,
  8,8,0,0,
  9,9,0,0,
]

export const capybara = {
  idle: IDLE_SEQ.map((i) => POSES[i]),
}

export type BuddyState = keyof typeof capybara
