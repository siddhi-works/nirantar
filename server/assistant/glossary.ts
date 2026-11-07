/**
 * Plain-language meanings of the terms a patient meets on a slip or in this app. This is general knowledge: it says what a test
 * or word is and why it is done, never what a particular person's number means. Written conservatively; clinicians must review it.
 */
export interface Term { id: string; match: RegExp; en: string; hi: string; product?: boolean }

const CLOSE_EN = ' This is general information, not about you. Your doctor tells you what your own numbers should be.';
const CLOSE_HI = ' यह सामान्य जानकारी है, आपके बारे में नहीं। आपके अपने नंबर कितने होने चाहिए, यह आपका डॉक्टर बताता है।';

export const TERMS: Term[] = [
  { id: 'hba1c', match: /hba1c|\ba1c\b|glycated|glycosylated|एचबीए1सी|ए1सी/i,
    en: 'HbA1c is a blood test that shows your average blood sugar over the last two to three months. It is usually done every few months.' + CLOSE_EN,
    hi: 'HbA1c एक रक्त जाँच है जो पिछले दो-तीन महीनों की औसत शुगर दिखाती है। यह आमतौर पर कुछ महीनों में एक बार की जाती है।' + CLOSE_HI },
  { id: 'fbs', match: /\bfbs\b|\bfbg\b|fasting (blood )?(sugar|glucose)|खाली पेट/i,
    en: 'FBS means fasting blood sugar. It is the sugar level in your blood after you have not eaten for at least eight hours, usually first thing in the morning.' + CLOSE_EN,
    hi: 'FBS का मतलब है खाली पेट शुगर। यह कम से कम आठ घंटे कुछ न खाने के बाद, आमतौर पर सुबह सबसे पहले, खून में शुगर का स्तर है।' + CLOSE_HI },
  { id: 'ppbs', match: /\bppbs\b|\bppg\b|post[- ]?(prandial|meal)|after[- ]?(meal|food) (sugar|glucose)|खाने के बाद/i,
    en: 'PPBS means post-prandial blood sugar. It is the sugar level in your blood about two hours after you start a meal.' + CLOSE_EN,
    hi: 'PPBS का मतलब है खाने के बाद की शुगर। यह भोजन शुरू करने के लगभग दो घंटे बाद खून में शुगर का स्तर है।' + CLOSE_HI },
  { id: 'rbs', match: /\brbs\b|random (blood )?(sugar|glucose)/i,
    en: 'RBS means random blood sugar: a sugar reading taken at any time of the day, whether or not you have eaten.' + CLOSE_EN,
    hi: 'RBS का मतलब है रैंडम शुगर: दिन के किसी भी समय ली गई शुगर की जाँच, चाहे आपने खाया हो या नहीं।' + CLOSE_HI },
  { id: 'egfr', match: /egfr|\bgfr\b|glomerular|ईजीएफआर/i,
    en: 'eGFR is an estimate of how well your kidneys filter your blood. It is worked out from a blood test (creatinine), your age and your sex.' + CLOSE_EN,
    hi: 'eGFR यह अनुमान है कि आपकी किडनी खून को कितनी अच्छी तरह छानती है। इसे खून की जाँच (क्रिएटिनिन), आपकी आयु और लिंग से निकाला जाता है।' + CLOSE_HI },
  { id: 'creatinine', match: /creatinine|क्रिएटिनिन/i,
    en: 'Creatinine is a waste product in the blood that the kidneys remove. A blood test for it is used to check how well the kidneys are working.' + CLOSE_EN,
    hi: 'क्रिएटिनिन खून में मौजूद एक अपशिष्ट पदार्थ है जिसे किडनी बाहर निकालती है। किडनी कैसे काम कर रही है, यह जाँचने के लिए इसकी खून की जाँच की जाती है।' + CLOSE_HI },
  { id: 'uacr', match: /uacr|\bacr\b|albumin|albuminuria|microalbumin|proteinuria|urine protein|एल्बुमिन|पेशाब में प्रोटीन/i,
    en: 'uACR is a urine test that compares albumin, a protein, with creatinine. Protein leaking into the urine can be an early sign that the kidneys are under strain, which is why it is checked in people with diabetes.' + CLOSE_EN,
    hi: 'uACR एक पेशाब की जाँच है जो एल्बुमिन (एक प्रोटीन) की तुलना क्रिएटिनिन से करती है। पेशाब में प्रोटीन का रिसना किडनी पर दबाव का शुरुआती संकेत हो सकता है, इसीलिए मधुमेह वालों में इसे जाँचा जाता है।' + CLOSE_HI },
  { id: 'kft', match: /\bkft\b|\bckd\b|kidney function|chronic kidney|किडनी की जाँच|किडनी फंक्शन/i,
    en: 'KFT means kidney function test: blood and urine tests that show how well the kidneys are working. CKD means chronic kidney disease, a long-lasting reduction in kidney function.' + CLOSE_EN,
    hi: 'KFT का मतलब है किडनी फ़ंक्शन टेस्ट: खून और पेशाब की जाँचें जो दिखाती हैं कि किडनी कैसे काम कर रही है। CKD का मतलब है क्रॉनिक किडनी डिज़ीज़, किडनी के काम में लंबे समय तक रहने वाली कमी।' + CLOSE_HI },
  { id: 'ldl', match: /\bldl\b|bad cholesterol|एलडीएल/i,
    en: 'LDL is a type of cholesterol, a fat carried in the blood. It is often called “bad” cholesterol because too much of it can build up in blood vessels over time.' + CLOSE_EN,
    hi: 'LDL एक तरह का कोलेस्ट्रॉल है, यानी खून में बहने वाली चर्बी। इसे अक्सर “खराब” कोलेस्ट्रॉल कहते हैं क्योंकि ज़्यादा होने पर यह समय के साथ रक्त नलिकाओं में जम सकता है।' + CLOSE_HI },
  { id: 'hdl', match: /\bhdl\b|good cholesterol|एचडीएल/i,
    en: 'HDL is a type of cholesterol often called “good” cholesterol, because it helps carry cholesterol away from the blood vessels.' + CLOSE_EN,
    hi: 'HDL एक तरह का कोलेस्ट्रॉल है जिसे अक्सर “अच्छा” कोलेस्ट्रॉल कहते हैं, क्योंकि यह कोलेस्ट्रॉल को रक्त नलिकाओं से दूर ले जाने में मदद करता है।' + CLOSE_HI },
  { id: 'tg', match: /triglyceride|\btg\b|ट्राइग्लिसराइड/i,
    en: 'Triglycerides are another kind of fat in the blood. A blood test measures them as part of the lipid profile.' + CLOSE_EN,
    hi: 'ट्राइग्लिसराइड खून में मौजूद एक और तरह की चर्बी है। लिपिड प्रोफ़ाइल के हिस्से के रूप में खून की जाँच से इसे मापा जाता है।' + CLOSE_HI },
  { id: 'lipid', match: /lipid|cholesterol|कोलेस्ट्रॉल|लिपिड/i,
    en: 'A lipid profile is a blood test that measures the fats in your blood: total cholesterol, LDL, HDL and triglycerides.' + CLOSE_EN,
    hi: 'लिपिड प्रोफ़ाइल एक रक्त जाँच है जो खून में मौजूद चर्बी को मापती है: कुल कोलेस्ट्रॉल, LDL, HDL और ट्राइग्लिसराइड।' + CLOSE_HI },
  { id: 'alt', match: /\balt\b|sgpt|\blft\b|liver function|liver test|लिवर की जाँच/i,
    en: 'ALT (also called SGPT) is an enzyme found mostly in the liver, and it is one of the tests in a liver function test (LFT). It shows how the liver is doing.' + CLOSE_EN,
    hi: 'ALT (जिसे SGPT भी कहते हैं) एक एंज़ाइम है जो ज़्यादातर लिवर में पाया जाता है, और यह लिवर फ़ंक्शन टेस्ट (LFT) की जाँचों में से एक है। यह दिखाता है कि लिवर कैसा काम कर रहा है।' + CLOSE_HI },
  { id: 'bp', match: /blood pressure|\bbp\b|systolic|diastolic|hypertension|रक्तचाप|ब्लड प्रेशर|बीपी/i,
    en: 'Blood pressure is the force of blood pushing on the walls of your arteries. It is written as two numbers: the top one (systolic) is the pressure when the heart beats, and the bottom one (diastolic) is the pressure between beats. Hypertension means the pressure stays high.' + CLOSE_EN,
    hi: 'रक्तचाप वह बल है जिससे खून धमनियों की दीवारों पर दबाव डालता है। इसे दो संख्याओं में लिखा जाता है: ऊपर वाली (सिस्टोलिक) दिल के धड़कने के समय का दबाव है, और नीचे वाली (डायस्टोलिक) धड़कनों के बीच का दबाव है। हाइपरटेंशन का मतलब है कि दबाव ऊँचा बना रहता है।' + CLOSE_HI },
  { id: 'bmi', match: /\bbmi\b|body mass|obesity|obese|मोटापा/i,
    en: 'BMI, or body mass index, is a number worked out from your weight and height. It is a simple way to see whether weight is likely to affect health. Obesity means carrying a lot of extra body fat.' + CLOSE_EN,
    hi: 'BMI, यानी बॉडी मास इंडेक्स, आपके वज़न और लंबाई से निकाली गई संख्या है। यह देखने का एक सरल तरीका है कि वज़न सेहत पर असर डाल सकता है या नहीं। मोटापे का मतलब है शरीर में बहुत ज़्यादा अतिरिक्त चर्बी होना।' + CLOSE_HI },
  { id: 'neuropathy', match: /neuropath|नसों|न्यूरोपैथी/i,
    en: 'Neuropathy means damage to the nerves. In diabetes it often affects the feet and legs, and can cause tingling, numbness or pain. A foot examination checks for it.' + CLOSE_EN,
    hi: 'न्यूरोपैथी का मतलब है नसों को नुकसान। मधुमेह में यह अक्सर पैरों और टाँगों को प्रभावित करती है, और झुनझुनी, सुन्नपन या दर्द हो सकता है। पैर की जाँच में इसे देखा जाता है।' + CLOSE_HI },
  { id: 'retinopathy', match: /retinopath|retina|रेटिना|आँख की जाँच/i,
    en: 'Retinopathy means damage to the retina, the light-sensing layer at the back of the eye. High blood sugar over many years can cause it, which is why an eye examination is advised for people with diabetes.' + CLOSE_EN,
    hi: 'रेटिनोपैथी का मतलब है रेटिना को नुकसान, यानी आँख के पीछे की रोशनी पहचानने वाली परत। कई सालों तक ऊँची शुगर से यह हो सकती है, इसीलिए मधुमेह वालों को आँख की जाँच की सलाह दी जाती है।' + CLOSE_HI },
  { id: 'osa', match: /\bosa\b|sleep apn|apnoea|apnea|स्लीप एपनिया/i,
    en: 'OSA, or obstructive sleep apnoea, is a condition where breathing repeatedly stops for a short time during sleep. It is screened for because it is more common in people who are overweight.' + CLOSE_EN,
    hi: 'OSA, यानी ऑब्सट्रक्टिव स्लीप एपनिया, एक स्थिति है जिसमें नींद के दौरान साँस बार-बार थोड़ी देर के लिए रुक जाती है। इसकी जाँच इसलिए की जाती है क्योंकि यह ज़्यादा वज़न वालों में अधिक होती है।' + CLOSE_HI },
  { id: 'diabetes', match: /diabetes|type 2|मधुमेह|डायबिटीज/i,
    en: 'Diabetes is a long-term condition in which the body cannot keep the sugar in the blood at a healthy level. In type 2 diabetes the body does not use insulin well enough, and often does not make enough of it.' + CLOSE_EN,
    hi: 'मधुमेह एक लंबे समय तक रहने वाली स्थिति है जिसमें शरीर खून में शुगर को स्वस्थ स्तर पर नहीं रख पाता। टाइप 2 मधुमेह में शरीर इंसुलिन का ठीक से उपयोग नहीं कर पाता, और अक्सर पर्याप्त इंसुलिन बनाता भी नहीं।' + CLOSE_HI },
  { id: 'insulin', match: /insulin|इंसुलिन/i,
    en: 'Insulin is a hormone made by the pancreas. It helps sugar move from the blood into the body’s cells. Some people with diabetes take insulin as an injection.' + CLOSE_EN,
    hi: 'इंसुलिन अग्न्याशय में बनने वाला हार्मोन है। यह शुगर को खून से शरीर की कोशिकाओं में पहुँचाने में मदद करता है। मधुमेह के कुछ मरीज़ इंसुलिन का इंजेक्शन लेते हैं।' + CLOSE_HI },
  { id: 'metformin', match: /metformin|मेटफॉर्मिन/i,
    en: 'Metformin is a tablet commonly used to help control blood sugar in type 2 diabetes. It is taken exactly as the doctor has written it.' + CLOSE_EN,
    hi: 'मेटफॉर्मिन एक गोली है जो टाइप 2 मधुमेह में शुगर को नियंत्रित करने में मदद के लिए आम तौर पर दी जाती है। इसे ठीक वैसे ही लिया जाता है जैसा डॉक्टर ने लिखा हो।' + CLOSE_HI },
  { id: 'abha', match: /\babha\b|आभा/i, product: true,
    en: 'ABHA is the Ayushman Bharat Health Account number: a 14-digit number that identifies you in India’s digital health system, so your records can be linked to you.',
    hi: 'ABHA आयुष्मान भारत स्वास्थ्य खाता नंबर है: 14 अंकों का नंबर जो भारत की डिजिटल स्वास्थ्य प्रणाली में आपकी पहचान कराता है, ताकि आपके रिकॉर्ड आपसे जुड़ सकें।' },
  { id: 'abdm', match: /\babdm\b|ayushman bharat digital|nha\b/i, product: true,
    en: 'ABDM is the Ayushman Bharat Digital Mission, the government programme that sets the rules for sharing health records between hospitals and patients, always with the patient’s consent. This site only imitates it, with made-up data.',
    hi: 'ABDM आयुष्मान भारत डिजिटल मिशन है, यानी सरकारी कार्यक्रम जो अस्पतालों और मरीज़ों के बीच स्वास्थ्य रिकॉर्ड साझा करने के नियम तय करता है, हमेशा मरीज़ की सहमति से। यह साइट केवल उसकी नकल करती है, काल्पनिक डेटा के साथ।' },
  { id: 'consent', match: /consent|सहमति/i, product: true,
    en: 'Consent means your permission. In ABDM a hospital can see or receive your records only if you allow it, for the kinds of record and the time you choose. You can withdraw it at any time.',
    hi: 'सहमति का मतलब है आपकी अनुमति। ABDM में कोई अस्पताल आपके रिकॉर्ड तभी देख या पा सकता है जब आप अनुमति दें, उन्हीं प्रकार के रिकॉर्ड और उतने समय के लिए जो आप चुनें। आप इसे किसी भी समय वापस ले सकते हैं।' },
  { id: 'opd', match: /\bopd\b|out[- ]?patient|token/i, product: true,
    en: 'OPD means outpatient department: where patients are seen without being admitted to the hospital. A token is the number you are given so that you are called in turn.',
    hi: 'OPD का मतलब है आउटपेशेंट विभाग: जहाँ मरीज़ों को अस्पताल में भर्ती किए बिना देखा जाता है। टोकन वह नंबर है जो आपको दिया जाता है ताकि आपको बारी से बुलाया जा सके।' },
];

const DEFINE = /\b(what('s| is| are| does)|meaning|mean\b|explain|define|full form|tell me about|about|kya hai|kya hota|kya hoti|matlab)\b|क्या है|क्या होता|क्या होती|क्या हैं|मतलब|का अर्थ|के बारे में|समझाइए|समझाओ/i;
const MINE = /\bmy\b|\bmine\b|मेरा|मेरी|मेरे|\bhas\b|\bwas\b/i;

/** The term a question is asking about, when it is asking for a definition and not about the person's own numbers. */
export function termFor(question: string): Term | null {
  const q = question.trim();
  const words = q.split(/\s+/).filter(Boolean).length;
  const bare = words <= 3;
  if (!(DEFINE.test(q) || bare) || MINE.test(q)) return null;
  // the more specific terms are listed before the general ones, so the first match is the best match
  return TERMS.find(t => t.match.test(q)) ?? null;
}
