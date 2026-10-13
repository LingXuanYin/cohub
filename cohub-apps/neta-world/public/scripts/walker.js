export default function (ctx) {
  const s = ctx.state;
  s.x ??= ctx.self.base.position.x;
  s.y ??= ctx.self.base.position.y;
  s.face ??= 1;
  s.walking = false;
  let held = null;
  let goal = null;
  let next = 0;
  let pending = false;
  let disposed = false;
  ctx.onDispose(() => {
    disposed = true;
  });
  ctx.on('viewchange', ({ data }) => {
    s.scale = Math.max(1, 1 / data.camera.zoom);
  });
  render(ctx, 0);
  ctx.hitRegions({
    companion: { item: 'actor', cursor: 'grab', label: ctx.params.label || 'Companion' },
  });
  ctx.on('pointerdown', (e) => {
    if (!e.point) return;
    held = {
      x: e.point.x - s.x + ctx.self.base.position.x,
      y: e.point.y - s.y + ctx.self.base.position.y,
    };
    s.held = true;
    s.walking = false;
    goal = null;
  });
  ctx.on('pointermove', (e) => {
    if (!held || !e.point) return;
    s.x = ctx.self.base.position.x + e.point.x - held.x;
    s.y = ctx.self.base.position.y + e.point.y - held.y;
    render(ctx, ctx.frame.t);
  });
  ctx.on('pointerup', () => {
    if (!held) return;
    held = null;
    s.held = false;
    next = ctx.frame.t + 1500;
    if (ctx.capabilities.has('world.drop'))
      ctx.capabilities
        .call('world.drop', { x: s.x + 24 * (s.scale || 1), y: s.y + 32 * (s.scale || 1) })
        .catch(() => {});
  });
  ctx.on('pointercancel', () => {
    held = null;
    s.held = false;
  });
  ctx.on('click', () => {
    s.poked = ctx.frame.t;
  });
  ctx.onFrame(({ t, dt }) => {
    if (!held && !pending && t >= next && ctx.capabilities.has('world.destination')) {
      pending = true;
      next = t + 4000;
      ctx.capabilities
        .call('world.destination')
        .then((value) => {
          if (!disposed && !held) {
            goal = value;
            s.reducedMotion = Boolean(value?.reducedMotion);
          }
        })
        .catch(() => {
          goal = null;
        })
        .finally(() => {
          pending = false;
        });
    }
    s.walking = false;
    if (goal && !held && !s.reducedMotion) {
      const dx = goal.x - s.x,
        dy = goal.y - s.y,
        distance = Math.hypot(dx, dy);
      if (distance > 2) {
        const amount = Math.min(distance, dt * 0.1);
        s.x += (dx / distance) * amount;
        s.y += (dy / distance) * amount;
        s.face = dx < 0 ? -1 : 1;
        s.walking = true;
      }
    }
    render(ctx, t);
  });
}

function render(ctx, t) {
  const s = ctx.state;
  const blink = !s.reducedMotion && t % 4200 > 4020;
  const step = s.walking ? Math.round(Math.sin(t / 100) * 3) : 0;
  const hop =
    !s.reducedMotion && t - (s.poked ?? -10000) < 400
      ? Math.round(Math.sin(((t - s.poked) / 400) * Math.PI) * 6)
      : 0;
  const phase = `${blink}:${step}:${Boolean(s.held)}:${s.x}:${s.y}:${s.scale}:${hop}`;
  if (s.visual === phase) return;
  s.visual = phase;
  const rect = (x, y, width, height, fill = '#252c26') => ({
    type: 'shape',
    position: { x, y },
    size: { width, height },
    props: { geometry: 'rectangle' },
    style: { fill, strokeWidth: 0 },
  });
  const items = {
    head: {
      type: 'shape',
      position: { x: 4, y: 6 },
      size: { width: 40, height: 28 },
      props: { geometry: 'path', path: 'M0 0 H6 V4 H34 V0 H40 V22 H36 V28 H4 V22 H0 Z' },
      style: { fill: '#252c26', strokeWidth: 0 },
    },
    face: rect(10, 16, 28, 14, '#faf7e8'),
    eyeL: rect(16, 20, 4, blink ? 2 : 6),
    eyeR: rect(28, 20, 4, blink ? 2 : 6),
    body: rect(14, 34, 20, 10),
    belly: rect(18, 36, 12, 6, '#faf7e8'),
    legL: rect(17 - step, 44, 4, s.held ? 5 : 10),
    legR: rect(27 + step, 44, 4, s.held ? 5 : 10),
  };
  ctx.scene({
    actor: {
      type: 'frame',
      position: { x: s.x - ctx.self.base.position.x, y: s.y - ctx.self.base.position.y - hop },
      size: { width: 48, height: 64 },
      origin: { x: 0, y: 0 },
      scale: s.scale || 1,
      props: { decoration: 'none', clip: false },
    },
    ...Object.fromEntries(
      Object.entries(items).map(([id, item], z) => [id, { ...item, parent: 'actor', z }]),
    ),
  });
}
