import { useEffect, useMemo, useState } from "react";
import { categoryOf } from "../lib/categories";
import type { OptimizeResponse, Plan, PlanItem } from "../types";
import { ProductImage, RetailerLogo } from "./Media";
import { Price, eur } from "./Price";
import { Button, Notice } from "./ui";

const dmy = (iso: string) => iso.split("-").reverse().join(".");

function Summary({ plan }: { plan: Plan }) {
  const pct = plan.totalCount ? Math.round((plan.coveredCount / plan.totalCount) * 100) : 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
      <Stat label="Gesamt (nur Angebote)"><Price cents={plan.totalCents} size="lg" /><span className="font-display text-2xl ml-1">€</span></Stat>
      <Stat label="Ersparnis"><span className="font-display text-3xl text-tag tabular-nums">{eur(plan.savingsCents)}</span></Stat>
      <Stat label="Abgedeckt">
        <span className="font-display text-3xl tabular-nums">{plan.coveredCount}/{plan.totalCount}</span>
        <div className="h-1.5 bg-line rounded mt-2"><div className="h-full bg-ink rounded" style={{ width: `${pct}%` }} /></div>
      </Stat>
      <Stat label="Geschäfte"><span className="font-display text-3xl tabular-nums">{plan.stores.length}</span></Stat>
    </div>
  );
}
const Stat = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-line bg-card p-3"><div className="text-xs text-ink-soft mb-1">{label}</div>{children}</div>
);

const useChecked = (storeKey: string) => {
  const key = `sg.checked.${storeKey}`;
  const [set, setSet] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { return new Set(); }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* privat */ } }, [key, set]);
  return { set, toggle: (id: string) => setSet((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }), reset: () => setSet(new Set()) };
};

function planText(plan: Plan): string {
  const lines: string[] = [];
  for (const s of plan.stores) {
    lines.push(`${s.retailerName} (${eur(s.subtotalCents)})`);
    for (const it of s.items) lines.push(`- ${it.option.packs > 1 ? `${it.option.packs}× ` : ""}${it.option.offer.product_name} (${it.name}) ${eur(it.option.costCents)}`);
    lines.push("");
  }
  if (plan.uncovered.length) { lines.push("Ohne Angebot:"); plan.uncovered.forEach((u) => lines.push(`- ${u.display}`)); }
  return lines.join("\n").trim();
}

function ItemRow({ it, checked, onToggle }: { it: PlanItem; checked: boolean; onToggle: () => void }) {
  const o = it.option.offer;
  return (
    <li className={`py-3 flex gap-3 items-center ${checked ? "opacity-50" : ""}`}>
      <input type="checkbox" className="size-6 accent-[#14231f] shrink-0" checked={checked} onChange={onToggle} aria-label={`${it.name} abhaken`} />
      <ProductImage src={o.image_url} category={it.category} className="size-16 rounded-md border border-line shrink-0" iconSize="text-2xl" />
      <div className="min-w-0 flex-1">
        <div className={`font-semibold leading-snug ${checked ? "line-through" : ""}`}>{it.name}</div>
        <div className="text-sm text-ink-soft line-clamp-2">
          {it.option.packs > 1 ? `${it.option.packs} × ` : ""}{o.product_name}{o.description ? `, ${o.description}` : ""}
        </div>
        <div className="text-xs text-ink-soft mt-0.5">
          Bedarf: {it.display}
          {it.option.wastePct !== null && it.option.wastePct > 0.3 ? ` · ca. ${Math.round(it.option.wastePct * 100)} % bleiben übrig` : ""}
        </div>
      </div>
      <div className="text-right shrink-0">
        {o.discount_pct ? <span className="inline-block bg-tag text-white text-xs font-bold rounded px-1.5 mb-1">−{o.discount_pct} %</span> : null}
        <div><Price cents={o.price_cents} size="sm" /></div>
        {o.old_price_cents ? <div className="mt-0.5"><Price cents={o.old_price_cents} size="sm" strike /></div> : null}
        {o.valid_to ? <div className="text-[0.7rem] text-ink-soft mt-1">bis {dmy(o.valid_to)}</div> : null}
      </div>
    </li>
  );
}

function groupByCategory(items: PlanItem[]) {
  const out: { id: string; items: PlanItem[] }[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.id === it.category) last.items.push(it); else out.push({ id: it.category, items: [it] });
  }
  return out;
}

export function PlanView({ data }: { data: OptimizeResponse }) {
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const plan = data.plans[idx];
  const m = data.matching;
  const checked = useChecked("plan");
  const groups = useMemo(() => plan.stores.map((s) => ({ s, groups: groupByCategory(s.items) })), [plan]);

  async function copy() {
    try { await navigator.clipboard.writeText(planText(plan)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ohne Berechtigung */ }
  }

  return (
    <section aria-label="Einkaufsplan" className="mt-10">
      {(data.refresh?.firstError || data.refresh?.error) && (
        <div className="mb-4"><Notice tone="warn">Neue Angebote konnten gerade nicht geladen werden. Der Plan nutzt die gespeicherten Angebote.</Notice></div>
      )}

      <div role="tablist" aria-label="Strategie" className="flex gap-2 overflow-x-auto no-scrollbar">
        {data.plans.map((p, i) => (
          <button key={p.strategy} role="tab" aria-selected={i === idx} onClick={() => setIdx(i)}
            className={`shrink-0 rounded-full px-4 h-11 text-sm font-semibold border ${i === idx ? "bg-ink text-paper border-ink" : "bg-card border-line hover:bg-mint"}`}>
            {p.label}
          </button>
        ))}
      </div>

      <Summary plan={plan} />

      {plan.stores.length > 0 && (
        <div className="flex gap-2 mb-4">
          <Button variant="ghost" onClick={copy}>{copied ? "Kopiert ✓" : "Als Text kopieren"}</Button>
          {checked.set.size > 0 && <Button variant="ghost" onClick={checked.reset}>Haken zurücksetzen</Button>}
        </div>
      )}

      {plan.stores.length === 0 ? (
        <Notice>Für diese Zutaten gibt es in den gewählten Märkten keine passenden Angebote. Wähle weitere Märkte oder lade neue Angebote in den Einstellungen.</Notice>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          {groups.map(({ s, groups: gs }) => (
            <article key={s.retailerId} className="rounded-lg border border-line bg-card overflow-hidden">
              <header className="flex items-center gap-3 bg-ink text-paper px-4 py-3">
                <RetailerLogo src={s.items[0]?.option.offer.retailer_logo} name={s.retailerName} size={36} />
                <h2 className="text-2xl flex-1">{s.retailerName}</h2>
                <span className="font-display text-xl tabular-nums">{eur(s.subtotalCents)}</span>
              </header>
              <div className="px-4 pb-2">
                {gs.map((g) => {
                  const c = categoryOf(g.id);
                  return (
                    <div key={g.id}>
                      <h3 className="font-body !font-bold text-xs uppercase tracking-wider text-ink-soft pt-4 pb-1 flex items-center gap-1.5" style={{ fontStretch: "100%" }}>
                        <span aria-hidden="true">{c.icon}</span>{c.name}
                      </h3>
                      <ul className="divide-y divide-line">
                        {g.items.map((it) => {
                          const id = `${s.retailerId}:${it.key}`;
                          return <ItemRow key={id} it={it} checked={checked.set.has(id)} onToggle={() => checked.toggle(id)} />;
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}

      {plan.uncovered.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl mb-2">Ohne Angebot, normal einkaufen</h2>
          <ul className="flex flex-wrap gap-2">
            {plan.uncovered.map((u) => (
              <li key={u.key} className="rounded-full bg-card border border-line px-3 py-1.5 text-sm">
                <span aria-hidden="true">{categoryOf(u.category).icon} </span>{u.display}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink-soft mt-6">
        {m.withOffers} von {m.ingredients} Zutaten mit Angebot zugeordnet
        {m.aiAccepted ? `, ${m.aiAccepted} per KI geprüft` : ""}{m.fallbackAccepted ? `, ${m.fallbackAccepted} per Regel` : ""}.
        Preise gelten nur für Aktionsware; Zutaten ohne Angebot sind nicht eingerechnet.
      </p>
    </section>
  );
}
