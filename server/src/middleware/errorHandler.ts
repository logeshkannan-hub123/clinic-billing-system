import type { ErrorRequestHandler } from "express";

// Last-resort handler: never leak internal error details to the client.
export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  console.error(error);
  // If a response has already started (e.g. mid-stream), Express's own docs
  // say to delegate to the default handler rather than call res.status/json
  // again — doing so would throw ERR_HTTP_HEADERS_SENT.
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(500).json({ error: "Internal server error" });
};
