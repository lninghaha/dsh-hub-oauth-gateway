export const JSON_BODY_LIMIT_BYTES = 64 * 1024;
export class JsonRequestError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.name = "JsonRequestError";
        this.statusCode = statusCode;
    }
}
function declaredLength(request) {
    const value = request.headers["content-length"];
    if (typeof value !== "string" || !/^\d+$/u.test(value))
        return undefined;
    const length = Number(value);
    return Number.isSafeInteger(length) ? length : undefined;
}
/** Read one JSON request body with a strict in-memory ceiling. */
export function readJsonRequest(request, limit = JSON_BODY_LIMIT_BYTES) {
    const length = declaredLength(request);
    if (length !== undefined && length > limit) {
        request.resume();
        return Promise.reject(new JsonRequestError(413, "request body is too large"));
    }
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let settled = false;
        const cleanup = () => {
            request.removeListener("data", onData);
            request.removeListener("end", onEnd);
            request.removeListener("error", onError);
            request.removeListener("aborted", onAborted);
        };
        const fail = (error) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            request.resume();
            reject(error);
        };
        const onData = (value) => {
            if (settled)
                return;
            const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
            size += chunk.byteLength;
            if (size > limit) {
                fail(new JsonRequestError(413, "request body is too large"));
                return;
            }
            chunks.push(chunk);
        };
        const onEnd = () => {
            if (settled)
                return;
            settled = true;
            cleanup();
            const text = Buffer.concat(chunks, size).toString("utf8").trim();
            if (text.length === 0) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(text));
            }
            catch {
                reject(new JsonRequestError(400, "request body must contain valid JSON"));
            }
        };
        const onError = () => fail(new JsonRequestError(400, "request body could not be read"));
        const onAborted = () => fail(new JsonRequestError(400, "request body was aborted"));
        request.on("data", onData);
        request.once("end", onEnd);
        request.once("error", onError);
        request.once("aborted", onAborted);
    });
}
export function requestErrorStatus(error, fallback) {
    return error instanceof JsonRequestError ? error.statusCode : fallback;
}
//# sourceMappingURL=http-json.js.map