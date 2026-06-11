export function buildOkStateResponse(state, extra = {}) {
  return {
    ok: true,
    ...extra,
    state,
  };
}
