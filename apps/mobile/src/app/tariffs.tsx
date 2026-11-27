import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  DSOS,
  PROFILE_PRESETS,
  costOf,
  marginalPrice,
  shiftUsage,
  syntheticProfile,
  tariffOptions,
  type CostBreakdown,
  type PricesYear,
  type ProfileKind,
  type TariffOption,
} from '@energy/core';
import { Screen } from '../components/Screen';
import { Card, Chip, Muted } from '../components/ui';
import { useData } from '../lib/data';
import { formatNumber } from '../lib/format';
import { useRemoteJson } from '../lib/remote';
import { FONT, useTheme } from '../lib/theme';

const HOUR = 3_600_000;
const KWH_CHOICES = [1500, 2000, 3000, 5000, 8000];
const SHIFT_CHOICES = [
  { share: 0, label: 'Nic' },
  { share: 0.15, label: 'Trochę (15%)' },
  { share: 0.3, label: 'Sporo (30%)' },
];
const MARGIN_CHOICES = [0.03, 0.06, 0.1];

const zl = (x: number) => `${formatNumber(x)} zł`;
const zlKwh = (x: number) =>
  `${x.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł/kWh`;

interface Row {
  option: TariffOption;
  cost: CostBreakdown;
}

export default function Tariffs() {
  const t = useTheme();
  const { zone } = useData();
  const [dsoId, setDsoId] = useState('tauron');
  const [phases, setPhases] = useState<1 | 3>(1);
  const [kind, setKind] = useState<ProfileKind>('household');
  const [annualKwh, setAnnualKwh] = useState(2000);
  const [shift, setShift] = useState(0.15);
  const [margin, setMargin] = useState(0.06);
  const [open, setOpen] = useState<string | null>(null);
  const year = useRemoteJson<PricesYear>(zone === 'pl' ? 'pl/prices-year.json' : null);

  const dso = DSOS.find((d) => d.id === dsoId)!;
  // Without the one-year price file, profile the last 365 days up to yesterday.
  const [fallbackEnd] = useState(() => Math.floor(Date.now() / HOUR) * HOUR - 24 * HOUR);

  const market = useMemo(() => {
    if (year.status !== 'ok' || year.data.currency !== 'PLN') return null;
    const start = Date.parse(year.data.start);
    const values = year.data.values;
    return {
      start,
      end: start + values.length * HOUR,
      // PLN/MWh -> zł/kWh
      price: (ms: number) => {
        const v = values[Math.floor((ms - start) / HOUR)];
        return v == null ? undefined : v / 1000;
      },
    };
  }, [year]);

  const rows: Row[] = useMemo(() => {
    const end = market?.end ?? fallbackEnd;
    const start = market?.start ?? end - 365 * 24 * HOUR;
    const usage = syntheticProfile(kind, annualKwh, start, end);
    const options = tariffOptions(dso, market ? { marginPerKwh: margin, monthlyFee: 0 } : undefined);
    return options
      .map((option) => {
        const shifted = shiftUsage(usage, shift, (ms) => marginalPrice(option, ms, market?.price));
        return { option, cost: costOf(option, shifted, { phases, marketPrice: market?.price }) };
      })
      .sort((a, b) => a.cost.total - b.cost.total);
  }, [dso, kind, annualKwh, shift, margin, phases, market, fallbackEnd]);

  const g11 = rows.find((r) => r.option.tariff.group === 'G11' && r.option.energy.kind === 'regulated');
  const maxTotal = Math.max(...rows.map((r) => r.cost.total));

  if (zone !== 'pl') {
    return (
      <Screen title="Porównanie taryf">
        <Card>
          <Muted>Porównanie taryf dotyczy polskich gospodarstw domowych. Wybierz Polskę powyżej.</Muted>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Porównanie taryf">
      <Card title="Twój operator sieci" subtitle="Znajdziesz go na fakturze (sprzedawca to co innego)">
        <View style={styles.chips}>
          {DSOS.map((d) => (
            <Chip key={d.id} label={d.name} selected={d.id === dsoId} onPress={() => setDsoId(d.id)} />
          ))}
        </View>
        <Muted>{dso.area}</Muted>
        <View style={styles.chips}>
          <Chip label="Instalacja 1-fazowa" selected={phases === 1} onPress={() => setPhases(1)} />
          <Chip label="3-fazowa" selected={phases === 3} onPress={() => setPhases(3)} />
        </View>
      </Card>

      <Card title="Twoje zużycie">
        <View style={styles.chips}>
          {PROFILE_PRESETS.map((p) => (
            <Chip
              key={p.kind}
              label={p.label}
              selected={p.kind === kind}
              onPress={() => {
                setKind(p.kind);
                setAnnualKwh(p.annualKwh);
              }}
            />
          ))}
        </View>
        <Muted>{PROFILE_PRESETS.find((p) => p.kind === kind)!.description}. Rocznie:</Muted>
        <View style={styles.chips}>
          {[...new Set([...KWH_CHOICES, annualKwh])]
            .sort((a, b) => a - b)
            .map((k) => (
              <Chip
                key={k}
                label={`${formatNumber(k)} kWh`}
                selected={k === annualKwh}
                onPress={() => setAnnualKwh(k)}
              />
            ))}
        </View>
        <Muted>Ile zużycia przesuniesz w tańsze godziny (pranie, zmywarka, bojler, auto na timerze)?</Muted>
        <View style={styles.chips}>
          {SHIFT_CHOICES.map((s) => (
            <Chip
              key={s.share}
              label={s.label}
              selected={s.share === shift}
              onPress={() => setShift(s.share)}
            />
          ))}
        </View>
        {market && (
          <>
            <Muted>Marża sprzedawcy w taryfie dynamicznej (netto, ponad cenę RCE):</Muted>
            <View style={styles.chips}>
              {MARGIN_CHOICES.map((m) => (
                <Chip key={m} label={zlKwh(m)} selected={m === margin} onPress={() => setMargin(m)} />
              ))}
            </View>
          </>
        )}
      </Card>

      <Card
        title="Ile zapłacisz w rok"
        subtitle="Brutto, z dystrybucją, opłatami i VAT — na cenach z ostatnich 12 miesięcy"
      >
        {rows.map((r, i) => {
          const diff = g11 ? r.cost.total - g11.cost.total : 0;
          const expanded = open === r.option.id;
          return (
            <Pressable
              key={r.option.id}
              onPress={() => setOpen(expanded ? null : r.option.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              style={[
                styles.row,
                i > 0 && { borderTopColor: t.grid, borderTopWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <View style={styles.rowHead}>
                <Text style={[styles.rank, { color: i === 0 ? t.accent : t.textMuted }]}>{i + 1}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.name, { color: t.text }]}>{r.option.label}</Text>
                  <Text style={{ color: t.textMuted, fontSize: FONT.tiny }}>
                    {r.option.energy.kind === 'dynamic'
                      ? 'Cena energii co godzinę z giełdy (RCE) + marża'
                      : r.option.tariff.description}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.total, { color: t.text }]}>{zl(r.cost.total)}</Text>
                  {g11 && r !== g11 && (
                    <Text
                      style={{
                        color: diff < 0 ? t.successText : t.textMuted,
                        fontSize: FONT.small,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {diff < 0 ? '−' : '+'}
                      {zl(Math.abs(diff))} vs G11
                    </Text>
                  )}
                </View>
              </View>
              <View style={[styles.track, { backgroundColor: t.grid }]}>
                <View
                  style={{
                    width: `${(r.cost.total / maxTotal) * 100}%`,
                    height: '100%',
                    borderRadius: 4,
                    backgroundColor: i === 0 ? t.accent : t.deemph,
                  }}
                />
              </View>
              {expanded && <Breakdown row={r} />}
            </Pressable>
          );
        })}
        <Muted>Dotknij wiersza, aby zobaczyć szczegóły.</Muted>
      </Card>

      <Card title="Jak to liczymy">
        <Muted>
          Zużycie to typowy profil godzinowy dla wybranego typu domu (nie Twoje dane z licznika — import z
          eLicznika dodamy wkrótce). Część zużycia z każdego dnia przenosimy w najtańsze godziny danej taryfy.
          Stawki: taryfy operatorów i sprzedawców z urzędu na 2026 r. zatwierdzone przez URE, opłata mocowa,
          OZE, kogeneracyjna, jakościowa, akcyza i VAT 23%.
          {!dso.verified &&
            ' Stawki PGE Dystrybucja pochodzą ze źródła pośredniego — sprawdź je na fakturze.'}
        </Muted>
        <Muted>
          Taryfa dynamiczna:{' '}
          {market
            ? 'godzinowe ceny RCE z ostatnich 365 dni plus wybrana marża sprzedawcy. Opłata stała u sprzedawców dynamicznych bywa wyższa — sprawdź ofertę.'
            : 'brak rocznych cen w danych — pojawią się po pierwszym tygodniowym przeliczeniu.'}
        </Muted>
        <Muted>Źródło stawek dystrybucji: {dso.source.name}.</Muted>
      </Card>
    </Screen>
  );
}

function Breakdown({ row }: { row: Row }) {
  const t = useTheme();
  const c = row.cost;
  const items: [string, number][] = [
    ['Energia', c.energy],
    ['Dystrybucja zmienna (z opłatami)', c.distributionVariable],
    ['Opłaty stałe (sieć, abonament, mocowa)', c.fixed],
    ['VAT', c.vat],
  ];
  return (
    <View style={{ gap: 4, marginTop: 4 }}>
      {items.map(([label, v]) => (
        <View key={label} style={styles.bd}>
          <Text style={{ color: t.textMuted, fontSize: FONT.small, flex: 1 }}>{label}</Text>
          <Text style={{ color: t.text, fontSize: FONT.small, fontVariant: ['tabular-nums'] }}>{zl(v)}</Text>
        </View>
      ))}
      <View style={styles.bd}>
        <Text style={{ color: t.textMuted, fontSize: FONT.small, flex: 1 }}>
          Średnio za kWh, wszystko wliczone
        </Text>
        <Text style={{ color: t.text, fontSize: FONT.small, fontWeight: '600' }}>{zlKwh(c.perKwh)}</Text>
      </View>
      <Muted>
        Zużycie w strefach:{' '}
        {c.byZone
          .sort((a, b) => b.kwh - a.kwh)
          .map((z) => `${z.label} ${formatNumber((z.kwh / c.kwh) * 100)}%`)
          .join(' · ')}
        {c.missingPriceHours > 0 && ` · ${c.missingPriceHours} h bez ceny (liczone średnią)`}
      </Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { paddingVertical: 10, gap: 6 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { fontSize: FONT.title, fontWeight: '700', width: 22, textAlign: 'center' },
  name: { fontSize: FONT.body, fontWeight: '600' },
  total: { fontSize: FONT.body, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginLeft: 34 },
  bd: { flexDirection: 'row', gap: 8, marginLeft: 34 },
});
