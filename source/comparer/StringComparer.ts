import { CaseInsensitiveStringComparer, CaseSensitiveStringComparer } from "../internal";

export class StringComparer {
    static readonly IgnoreCase = new CaseInsensitiveStringComparer();
    static readonly Default = new CaseSensitiveStringComparer();
}