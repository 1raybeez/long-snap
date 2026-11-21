"use client";
import { useEffect, useState } from "react";
import { contactIcon, contactKind } from "./contact-icons.ts";

type Links = { readonly text: string | null; readonly sleeper: string | null; readonly whatsapp?: string | null };
const DEFAULT_METHODS = ["Text Message", "Sleeper"];

export function ContactActions({ endpoint, signInHref, methods }: { readonly endpoint: string; readonly signInHref: string | null; readonly methods: readonly string[] }) {
  const [state, setState] = useState<"loading" | "member" | "guest" | "error">("loading");
  const [links, setLinks] = useState<Links>({ text: null, sleeper: null, whatsapp: null });
  useEffect(() => {
    let live = true;
    fetch(endpoint, { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 401 || res.status === 403) { setState("guest"); return; }
        if (!res.ok) { setState("error"); return; }
        const body = (await res.json()) as Partial<Links>;
        setLinks({ text: body.text ?? null, sleeper: body.sleeper ?? null, whatsapp: body.whatsapp ?? null });
        setState("member");
      })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [endpoint]);

  const shown = [...(methods.length ? methods : DEFAULT_METHODS)];
  if (state === "member" && links.whatsapp && !shown.some((m) => contactKind(m) === "whatsapp")) shown.push("WhatsApp");
  const hrefFor = (method: string): string | null => {
    if (state !== "member") return null;
    const kind = contactKind(method);
    return kind === "sleeper" ? links.sleeper : kind === "whatsapp" ? links.whatsapp ?? null : kind === "text" || kind === "phone" ? links.text : null;
  };
  return (
    <>
      <p className="op-field-label">{methods.length ? "Preferred contact" : "Contact"}</p>
      <ul className="op-contact">
        {shown.map((method) => {
          const icon = contactIcon(contactKind(method));
          const href = hrefFor(method);
          const inner = <>{icon ? <img src={icon} alt="" width={36} height={36} /> : <span className="op-contact-dot" aria-hidden="true">✉</span>}<span>{method}</span></>;
          const external = contactKind(method) !== "text" && contactKind(method) !== "phone";
          return <li key={method}>{href ? <a className="op-contact-link" href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} aria-label={`${method}: message this owner`}>{inner}</a> : inner}</li>;
        })}
      </ul>
      {state === "guest" && signInHref ? <p className="op-fine"><a href={signInHref}>Sign in</a> to message this owner.</p> : null}
      {state === "member" && !links.text && !links.sleeper && !links.whatsapp ? <p className="op-fine">No contact link on file yet.</p> : null}
    </>
  );
}
