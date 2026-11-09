import { useState } from "react";
import type { OptimizeResponse, Plan } from "../types";
import { Price, eur } from "./Price";
import { Notice } from "./ui";

function PlanSummary({ plan }: { plan: Plan }) {
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-3 py-4">
      <div>
        <div className="text-sm text-ink-soft">Gesamt (nur Angebote)</div>
        <Price cents={plan.totalCents} size="lg" />
        <span className="font-display text-2xl ml-1">€</span>
      </div>
      <div>
        <div className="text-sm text-ink-soft">Ersparnis laut Streichpreis</div>
        <div className="font-display text-2xl text-tag tabular-nums">{eur(plan.savingsCents)}</div>
      </div>
      <div>
        <div className="text-sm text-ink-soft">Abgedeckt</div>
        <div className="font-display text-2xl tabular-nums">{plan.coveredCount} von {plan.totalCount}</div>
      </div>
      <div>
        <div className="text-sm text-ink-soft">Geschäfte</div>
        <div className="font-display text-2xl tabular-nums">{plan.stores.length}</div>
      </div>
    </div>
  );
}

export function PlanView({ data }: { data: OptimizeResponse }) {
  const [idx, setIdx] = useState(0);
  const plan = data.plans[idx];
  const m = data.matching;

  return (
    <section aria-label="Einkaufsplan" className="mt-8">
      {data.refresh?.firstError || data.refresh?.error ? (
        <div className="mb-4">
          <Notice tone="warn">
            Neue Angebote konnten gerade nicht geladen werden. Der Plan nutzt die gespeicherten Angebote. Im Tab „Angebote“ kannst du
            Angebote importieren oder es später erneut versuchen.
          </Notice>
        </div>
      ) : null}

      <div role="tablist" aria-label="Strategie" className="flex flex-wrap gap-2">
        {data.plans.map((p, i) => (
          <button
            key={p.strategy}
            role="tab"
            aria-selected={i === idx}
            onClick={() => setIdx(i)}
            className={`rounded-md px-4 py-2 text-sm font-semibold border ${
              i === idx ? "bg-ink text-paper border-ink" : "bg-card border-line hover:bg-mint"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <PlanSummary plan={plan} />

      {plan.stores.length === 0 ? (
        <Notice>
          Für diese Zutaten gibt es noch keine passenden Angebote. Lade im Tab „Angebote“ aktuelle Angebote oder importiere eigene.
        </Notice>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {plan.stores.map((s) => (
            <article key={s.retailerId} className="receipt rounded-t-md border border-b-0 border-line px-5 pt-4">
              <header className="flex items-baseline justify-between border-b-2 border-ink pb-2 mb-1">
                <h3 className="text-2xl">{s.retailerName}</h3>
                <span className="font-display text-xl tabular-nums">{eur(s.subtotalCents)}</span>
              </header>
              <ul className="divide-y divide-line">
                {s.items.map((it) => (
                  <li key={it.key} className="py-3 flex gap-3 items-start">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{it.name}</div>
                      <div className="text-sm text-ink-soft">
                        {it.option.packs > 1 ? `${it.option.packs} × ` : ""}
                        {it.option.offer.product_name}
                        {it.option.offer.description ? `, ${it.option.offer.description}` : ""}
                      </div>
                      <div className="text-xs text-ink-soft mt-0.5">
                        Bedarf: {it.display}
                        {it.option.wastePct !== null && it.option.wastePct > 0.3
                          ? ` · ca. ${Math.round(it.option.wastePct * 100)} % bleiben übrig`
                          : ""}
                        {it.option.offer.via && it.option.offer.via !== "lexical" ? " · Zuordnung geprüft" : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Price cents={it.option.offer.price_cents} size="sm" />
                      {it.option.offer.old_price_cents ? (
                        <div className="mt-1"><Price cents={it.option.offer.old_price_cents} size="sm" strike /></div>
                      ) : null}
                      {it.option.offer.valid_to ? (
                        <div className="text-[0.7rem] text-ink-soft mt-1">bis {it.option.offer.valid_to.split("-").reverse().join(".")}</div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      {plan.uncovered.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xl mb-2">Ohne Angebot, normal einkaufen</h3>
          <ul className="flex flex-wrap gap-2">
            {plan.uncovered.map((u) => (
              <li key={u.key} className="rounded-md bg-card border border-line px-3 py-1.5 text-sm">{u.display}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink-soft mt-6">
        {m.withOffers} von {m.ingredients} Zutaten mit Angebot zugeordnet
        {m.aiAccepted ? `, ${m.aiAccepted} per KI geprüft` : ""}
        {m.fallbackAccepted ? `, ${m.fallbackAccepted} per Regel` : ""}. Preise gelten nur für Aktionsware; Zutaten ohne Angebot
        sind nicht eingerechnet.
      </p>
    </section>
  );
}
