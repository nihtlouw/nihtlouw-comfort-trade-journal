// The old shared journal endpoints were unauthenticated. They remain disabled;
// legacy database rows are retained for an explicit, administrator-only export.
const gone = () => Response.json({ error: "The legacy shared API is disabled. Use a private journal account." }, { status: 410 });
export const POST = gone;
export const DELETE = gone;
