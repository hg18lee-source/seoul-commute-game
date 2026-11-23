const gameKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyE']);

export function createPracticeInput() {
  const keys = new Set();
  const clear = () => keys.clear();
  function press(code, { playing, editing, composing, repeat }) {
    if (!gameKeys.has(code) || !playing || editing || composing) return 'ignore';
    if (repeat) return 'consume';
    keys.add(code);
    return code === 'KeyE' ? 'interact' : 'consume';
  }
  function motion(active) {
    if (!active) clear();
    return {
      dx: Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')),
      dz: Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp')),
      running: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    };
  }
  return { press, release: code => keys.delete(code), clear, motion };
}
