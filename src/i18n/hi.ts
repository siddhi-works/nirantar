/**
 * Hindi for the text that is fixed in the app, keyed by the English sentence. Anything missing falls back to English.
 * Written for this prototype and not yet reviewed by a native Hindi speaker or a medical translator: have both check it
 * before real patients see it.
 */
import { HI_MORE } from './hi-more';

const HI_BASE: Record<string, string> = {
  // sign in
  'Welcome back': 'वापसी पर स्वागत है',
  'Choose how you are signing in.': 'चुनें कि आप कैसे साइन इन कर रहे हैं।',
  'Doctor': 'डॉक्टर', 'Nurse': 'नर्स', 'Patient': 'मरीज़',
  'ABHA number': 'ABHA नंबर',
  '14-digit Ayushman Bharat Health Account number': '14 अंकों का आयुष्मान भारत स्वास्थ्य खाता नंबर',
  'Log in': 'लॉग इन करें',
  'Signing in…': 'सत्यापित हो रहा है…',
  'Care that doesn’t lose the thread between visits.': 'ऐसी देखभाल जो विज़िट के बीच कड़ी नहीं खोती।',
  'One continuous, evidence-linked diabetes record for the clinic and the patient.': 'क्लिनिक और मरीज़ के लिए एक निरंतर, प्रमाण से जुड़ा मधुमेह रिकॉर्ड।',
  'Every value traces back to the slip it came from': 'हर मान उस पर्ची तक वापस जाता है जिससे वह आया',
  'Missing tests are shown, never left blank': 'छूटी हुई जाँचें दिखाई जाती हैं, खाली नहीं छोड़ी जातीं',
  'Doctor, nurse and patient each see what they need': 'डॉक्टर, नर्स और मरीज़ को वही दिखता है जो उन्हें चाहिए',
  // patient page
  'Your health record · ABHA {abha}': 'आपका स्वास्थ्य रिकॉर्ड · ABHA {abha}',
  'Namaste, {name}': 'नमस्ते, {name}',
  'Your sugar control': 'आपका शुगर नियंत्रण',
  'Your HbA1c was {value}% at your last visit. The first value written in your record was {first}%.': 'आपकी पिछली विज़िट पर आपका HbA1c {value}% था। आपके रिकॉर्ड में लिखा गया पहला मान {first}% था।',
  'Fasting sugar': 'खाली पेट शुगर',
  'After-meal sugar': 'खाने के बाद की शुगर',
  'mg/dL · was {first}': 'mg/dL · पहले {first} था',
  'As of your visit on {date}': '{date} की आपकी विज़िट के अनुसार',
  'Your medicines': 'आपकी दवाइयाँ',
  'Your checks': 'आपकी जाँचें',
  'Last measured': 'हाल की माप',
  'Blood pressure': 'रक्तचाप',
  'Weight': 'वज़न',
  'Your visits': 'आपकी विज़िट',
  'Prototype with synthetic data. This is not medical advice — talk to your doctor.': 'यह प्रोटोटाइप है और डेटा कृत्रिम है। यह चिकित्सीय सलाह नहीं है — अपने डॉक्टर से बात करें।',
  'Listen': 'सुनें',
  'Stop': 'रोकें',
  // checks
  'Blood sugar': 'ब्लड शुगर',
  'Examination logs': 'जाँच का रिकॉर्ड',
  'Comorbidity logs': 'साथ की बीमारियों का रिकॉर्ड',
  'Follow-up': 'फ़ॉलो-अप',
  'Fasting glucose (FBS)': 'खाली पेट ग्लूकोज़ (FBS)',
  'Post-meal glucose (PPBS)': 'खाने के बाद ग्लूकोज़ (PPBS)',
  'Foot and ulcer exam': 'पैर और घाव की जाँच',
  'Neuropathy exam': 'नसों की जाँच (न्यूरोपैथी)',
  'Urine protein': 'पेशाब में प्रोटीन',
  'Kidney: eGFR': 'गुर्दा: eGFR',
  'Kidney: uACR': 'गुर्दा: uACR',
  'Retinopathy (eye exam)': 'आँख की जाँच (रेटिनोपैथी)',
  'Hypertension: blood pressure': 'उच्च रक्तचाप: ब्लड प्रेशर',
  'Liver tests (LFT)': 'लिवर की जाँच (LFT)',
  'Lipid profile': 'लिपिड प्रोफ़ाइल (कोलेस्ट्रॉल)',
  'Obesity: weight and BMI': 'मोटापा: वज़न और BMI',
  'Sleep apnoea screening': 'नींद में साँस रुकने की जाँच',
  'Next review date': 'अगली जाँच की तारीख़',
  'On record': 'रिकॉर्ड में है',
  'Not on record': 'रिकॉर्ड में नहीं है',
  // who can see the record
  'Who can see your record': 'आपका रिकॉर्ड कौन देख सकता है',
  '{n} waiting': '{n} प्रतीक्षा में',
  'No hospital has asked to see your record. When one does, you decide here.': 'किसी अस्पताल ने आपका रिकॉर्ड देखने को नहीं कहा है। जब कहेगा, तो फ़ैसला आप यहीं करेंगे।',
  '{hospital} wants to see your diabetes record.': '{hospital} आपका मधुमेह रिकॉर्ड देखना चाहता है।',
  'Purpose: {purpose} · access for {days} days · asked {date}': 'उद्देश्य: {purpose} · {days} दिन की पहुँच · अनुरोध {date}',
  'Allow': 'अनुमति दें', 'Decline': 'मना करें', 'Withdraw': 'वापस लें',
  'Allowed': 'अनुमति दी', 'Declined': 'मना किया', 'Withdrawn': 'वापस ली गई', 'Expired': 'समाप्त',
  'Waiting for the patient': 'मरीज़ के जवाब की प्रतीक्षा में',
  'Withdrawing stops new transfers and the hospital must erase the copy it already received.': 'अनुमति वापस लेने पर नई प्रतियाँ नहीं मँगाई जा सकतीं और अस्पताल को अपनी मिली हुई प्रति मिटानी होगी।',
  'Treatment': 'इलाज', 'Follow-up care': 'फ़ॉलो-अप देखभाल', 'Second opinion': 'दूसरी राय',
  // uploads
  'Your uploaded documents': 'आपके अपलोड किए दस्तावेज़',
  'Upload document': 'दस्तावेज़ अपलोड करें',
  'Waiting for your doctor to review': 'आपके डॉक्टर की समीक्षा की प्रतीक्षा में',
  'Add an old prescription or report. Your doctor reviews what is read from it.': 'कोई पुरानी पर्ची या रिपोर्ट जोड़ें। उससे पढ़े गए मानों की समीक्षा आपके डॉक्टर करेंगे।',
  'Edit': 'बदलें',
};

/** The screens' own text, then the doctor, nurse and sign-in screens. Where both have a line, the screens' own wins. */
export const HI: Record<string, string> = { ...HI_MORE, ...HI_BASE };
