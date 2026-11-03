import { describe, expect, it } from 'vitest';
import { extractValues, pageDate } from './values';

const find = (text: string, code: string) => extractValues(text, 1).filter(c => c.code === code);

describe('reading values from text', () => {
  it('reads the format the follow-up slips use', () => {
    const t = '04/11/2000 ABHA ID -\nI → FBS – 128 mg/dl; PPBS – 176 mg/dl; HbA1c – 6.8%. Urine protein remains positive.';
    expect(find(t, 'fbs')[0]).toMatchObject({ value: 128, page: 1, date: '2000-11-04' });
    expect(find(t, 'ppbs')[0].value).toBe(176);
    expect(find(t, 'hba1c')[0].value).toBe(6.8);
    expect(find(t, 'hba1c')[0].quote).toContain('HbA1c');
  });

  it('reads lab report wording', () => {
    expect(find('Fasting Blood Sugar : 142 mg/dL', 'fbs')[0].value).toBe(142);
    expect(find('Post prandial blood sugar 201', 'ppbs')[0].value).toBe(201);
    expect(find('Glycosylated Haemoglobin (HbA1c) 7,4 %', 'hba1c')[0].value).toBe(7.4);
    expect(find('eGFR: 61 mL/min/1.73 m2', 'egfr')[0].value).toBe(61);
    expect(find('LDL Cholesterol 142 mg/dL', 'ldl')[0].value).toBe(142);
    expect(find('HDL 38', 'hdl')[0].value).toBe(38);
    expect(find('Triglycerides 210 mg/dL', 'tg')[0].value).toBe(210);
    expect(find('SGPT 44 U/L', 'alt')[0].value).toBe(44);
  });

  it('reads blood pressure as a pair, and weight and height only when labelled', () => {
    const t = 'BP 130/80 mmHg  Pulse 76  Wt 68.5 kg  Height 171 cm';
    expect(find(t, 'sbp')[0].value).toBe(130);
    expect(find(t, 'dbp')[0].value).toBe(80);
    expect(find(t, 'pulse')[0].value).toBe(76);
    expect(find(t, 'weight')[0].value).toBe(68.5);
    expect(find(t, 'height')[0].value).toBe(171);
    expect(find('70/F, 65 kg, Gorakhpur', 'weight')).toHaveLength(0); // an unlabelled header weight is not guessed
  });

  it('reads an eye finding, and does not mistake non-proliferative for proliferative', () => {
    expect(find('Fundus: non-proliferative diabetic retinopathy', 'retina')[0].value).toBe('non-proliferative retinopathy');
    expect(find('No diabetic retinopathy seen', 'retina')[0].value).toBe('no retinopathy');
    expect(find('proliferative retinopathy', 'retina')[0].value).toBe('proliferative retinopathy');
  });

  it('keeps an implausible value but flags it, and never invents one', () => {
    const c = find('FBS 5000', 'fbs')[0];
    expect(c.value).toBe(5000);
    expect(c.flagged).toMatch(/implausible/);
    const text = 'Continue Tab. Metformin 500 mg oral before meal, 1 × 3 tab. Follow-up after 2 months. Low calorie diet.';
    expect(extractValues(text, 1)).toHaveLength(0);
  });

  it('quotes whole words around the value', () => {
    const q = find('Home readings remain elevated. Persistent hyperglycemia. I → FBS – 142 mg/dl; PPBS – 190 mg/dl', 'fbs')[0].quote;
    expect(q.startsWith('hyperglycemia') || q.startsWith('.') || q.startsWith('I')).toBe(true);
    expect(q).not.toMatch(/^[a-z]{1,4}\b(?!\s*→)/);
    expect(q).toContain('FBS – 142');
  });

  it('does not repeat a value written twice on a page', () => {
    expect(find('FBS 120 ... later FBS 120', 'fbs')).toHaveLength(1);
    expect(find('FBS 120 ... later FBS 135', 'fbs')).toHaveLength(2);
  });

  it('reads a day-first date and ignores nonsense', () => {
    expect(pageDate('Date 04/08/2000')).toBe('2000-08-04');
    expect(pageDate('on 31-12-2026')).toBe('2026-12-31');
    expect(pageDate('13/13/2020')).toBeNull();
    expect(pageDate('no date')).toBeNull();
  });
});
