export interface IEventInfo {
    namespace: string;
    /** When the event last happened (RFC 3339); empty if the cluster didn't record a time. */
    time: string;
    /** "Normal" or "Warning". The server sends it as `type_`, with the trailing underscore. */
    type_: string;
    reason: string;
    /** The object the event is about, as "Kind/name", e.g. "Pod/coredns-abc". */
    object: string;
    message: string;
}
