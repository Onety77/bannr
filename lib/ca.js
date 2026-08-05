// What a contract address looks like, in one place.
//
// A SHAPE CHECK, NOT A VALIDATION. It catches a mistyped or truncated
// paste before it costs a round trip; whether the address is a real
// token is settled by /api/lookup, which is the only thing that can
// actually answer it.
//
// Solana: base58, which excludes 0 O I l precisely so they cannot be
// confused with o, 1 and so on. EVM: 0x and forty hex digits.
//
// Lived in three files before this — /create, the homepage hero, and
// the post dialog — which is three chances for them to drift apart.
export const LOOKS_LIKE_CA = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40})$/;

export const looksLikeCa = (s) => LOOKS_LIKE_CA.test((s || "").trim());
