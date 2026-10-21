/** El cliente HTTP prudente del servidor es el único que habla con la fuente oficial; aquí solo se re-exportan sus tipos. */
import type { PoliteClient } from "../../http";

export { HttpError, SourceUnavailableError } from "../../http";
export type { FetchResult, Priority } from "../../http";
export type TsHttpClient = PoliteClient;
