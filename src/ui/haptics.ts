/**
 * A tiny vibration when a piece is moved, so a move can be felt with the phone on silent.
 *
 * What the browser allows, and what has and has not been tested:
 *  - Android Chrome and other browsers with the Vibration API: `navigator.vibrate` is used, for your own moves and the bot's replies.
 *  - iPhone and iPad: Safari has no Vibration API. Safari 17.4 and later gives a light tap when a switch-style checkbox is toggled by a
 *    touch, so a hidden one is toggled for your own moves. This only works inside a touch, so the bot's replies do not buzz on iOS.
 *    It is a workaround and is not guaranteed by Apple; it was not tested on a real device in this project.
 *  - Desktop browsers, and phones set to a mode that blocks vibration, do nothing. Nothing here ever throws or blocks.
 */
let enabled = true;
let label: HTMLLabelElement | null = null;

export const setHapticsEnabled = (on: boolean): void => {
  enabled = on;
};

const coarsePointer = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

/** Whether this device might give a tap at all (used only to word the setting honestly). */
export const hapticsMayWork = (): boolean => typeof navigator !== 'undefined' && (typeof navigator.vibrate === 'function' || coarsePointer());

function iosTap(): void {
  if (!label) {
    label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.setAttribute('data-haptic', '');
    label.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
  }
  label.click();
}

/** A very short tap. `strong` is slightly longer (a capture). Safe to call anywhere. */
export function tapHaptic(strong = false): void {
  if (!enabled || !coarsePointer()) return;
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(strong ? 22 : 10);
    else if (typeof document !== 'undefined') iosTap();
  } catch {
    /* a blocked or missing vibration is not an error */
  }
}
