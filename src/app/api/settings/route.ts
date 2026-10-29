const gone = () => Response.json({ error: "The legacy shared API is disabled. Use a private journal account." }, { status: 410 });
export const PATCH = gone;
