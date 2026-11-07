// The authenticated gender and school stage select the default character.
import { isElementary } from './student-variant.js';
export function studentAvatarAsset(me) {
  const girl = me?.user?.gender === 'f';
  if (isElementary(me)) return girl ? '/img/elementary/avatar-girl-v1.webp' : '/img/elementary/avatar-student-v2.webp';
  return girl ? '/img/student-v2/student-character-girl-v1.webp' : '/img/student-v2/student-character.webp';
}
