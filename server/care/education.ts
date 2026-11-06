/**
 * General education that goes with the kinds of advice a doctor writes. It explains advice already on the record in plain
 * words; it never adds a new instruction. It is general wording, not written for any one patient, and clinicians must review it.
 */
export interface Topic { id: string; title: string; match: RegExp; steps: string[] }

export const TOPICS: Topic[] = [
  { id: 'diet', title: 'Eating well', match: /diet|calorie|sugar|food|rice|sweet|eat\b|meal/i, steps: [
    'Eat smaller portions of rice, roti and other starchy foods.', 'Fill about half of the plate with vegetables.',
    'Keep sweets, sugary drinks and fried snacks for rare occasions.', 'Eat at regular times and do not skip meals.'] },
  { id: 'activity', title: 'Being active', match: /walk|exercise|physical|activity|yoga/i, steps: [
    'Walk briskly for about 30 minutes on most days, if your doctor has said it is safe for you.', 'Start slowly and build up.',
    'Stop and tell your doctor if you feel chest pain, dizziness or breathlessness.'] },
  { id: 'foot', title: 'Caring for your feet', match: /foot|feet|ulcer|neuropath/i, steps: [
    'Look at both feet every day, including between the toes.', 'Wash and dry them well. Do not walk barefoot.',
    'Wear soft shoes that fit well.', 'Show your doctor any cut, blister or sore that does not heal.'] },
  { id: 'medicines', title: 'Taking your medicines', match: /metformin|insulin|tablet|medicine|dose|drug|glimepiride|regimen/i, steps: [
    'Take each medicine at the time written on your slip.', 'Do not stop a medicine or change a dose on your own. Ask your doctor first.',
    'Carry your slip when you see any doctor.'] },
  { id: 'monitoring', title: 'Tests and follow-up', match: /follow[- ]?up|review|monitor|test|check/i, steps: [
    'Keep your follow-up visits.', 'Bring your earlier slips and reports with you.', 'Ask which tests are due.'] },
  { id: 'weight', title: 'A healthy weight', match: /weight|obes|bmi/i, steps: [
    'Small, steady weight loss can help. Ask your doctor what is right for you.'] },
];

export const topicsFor = (advice: string) => TOPICS.filter(t => t.match.test(advice));
