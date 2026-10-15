/** A versioned, user-visible prompt for an external image tool; no model call is made here. */
export const SUGGESTED_PROMPT_V2 = `Create an image of a LEGO brick sculpture of: [what you want to build, e.g. "my brown dachshund sitting"].
If I attached a photo, use it for the shape, pose and colors.

Build style:
- Built only from standard LEGO bricks, plates, slopes and tiles. No Technic, no printed or decorated parts, no minifigure parts, no transparent parts, no stickers.
- Strongly simplified: a stylized, blocky version built mostly from larger bricks; exaggerate the one or two most recognizable features.
- Use at most 6 solid colors, chosen from common LEGO colors.
- Sturdy, chunky proportions that could really stand: thick legs, a wide footprint, tails and ears kept close to the body, no thin parts sticking out, no floating pieces.
- The sculpture stands on its own: no baseplate, stand or display base under it.

Composition:
- Square image. One object only, centered, fully visible, filling about 70% of the frame.
- Viewed from the front, turned about 20 degrees to the left, camera slightly above.
- Plain light gray background, soft even lighting, no shadow on the background.
- Matte plastic look: no shiny highlights or reflections.
- No text, no logos, no people, no hands, no packaging.`;

export const SUGGESTED_PROMPT = SUGGESTED_PROMPT_V2;
