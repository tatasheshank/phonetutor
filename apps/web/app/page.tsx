"use client";

import { availableLanguages, type LanguageCode } from "@ai-tutor/shared";
import { useEffect, useState } from "react";
import { ConsentStep } from "../components/ConsentStep";
import { fetchMe, LoginStep, type Me } from "../components/LoginStep";
import { MicStep } from "../components/MicStep";
import { PhoneStep } from "../components/PhoneStep";
import { TutorRoom } from "../components/TutorRoom";
import { VoiceStep } from "../components/VoiceStep";
import { strings, type Strings } from "../lib/strings";
import { loadProfile, saveProfile, type Profile } from "../lib/profile";

/**
 * Onboarding:
 *   app language  -> menus, buttons, messages
 *   tutor language -> what the teacher speaks (can differ, e.g. app in English, lessons in Telugu)
 *   sign in -> voice -> phone screen language -> mic -> consent -> tutor
 */
type Step = "appLanguage" | "tutorLanguage" | "login" | "voice" | "phone" | "mic" | "consent" | "tutor";

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [step, setStep] = useState<Step>("appLanguage");

  // Returning learners skip onboarding; signed-out learners go to sign-in after choosing languages.
  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
    void fetchMe().then((m) => {
      setMe(m);
      if (!p.appLanguage) setStep("appLanguage");
      else if (!p.tutorLanguage) setStep("tutorLanguage");
      else if (!m.user) setStep("login");
      else setStep(nextStep(p, p.tutorLanguage));
    });
  }, []);

  if (!profile || !me) return null;

  const update = (patch: Partial<Profile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    saveProfile(next);
  };

  const appLang = profile.appLanguage ?? profile.tutorLanguage ?? "te";
  const tutorLang = profile.tutorLanguage ?? appLang;
  const t = strings(appLang);

  return (
    <main lang={appLang}>
      {step === "appLanguage" && (
        <AppLanguageStep
          selected={profile.appLanguage}
          onPick={(code) => {
            update({ appLanguage: code });
            setStep("tutorLanguage");
          }}
        />
      )}
      {step === "tutorLanguage" && (
        <TutorLanguageStep
          t={t}
          selected={profile.tutorLanguage ?? appLang}
          onPick={(code) => {
            const next = { ...profile, tutorLanguage: code };
            update(next);
            setStep(me.user ? nextStep(next, code) : "login");
          }}
        />
      )}
      {step === "login" && (
        <LoginStep
          t={t}
          onDone={(m) => {
            setMe(m);
            setStep(nextStep(profile, tutorLang));
          }}
        />
      )}
      {step === "voice" && (
        <VoiceStep
          key={tutorLang}
          t={t}
          language={tutorLang}
          initialVoiceId={profile.voices?.[tutorLang]}
          initialRate={profile.speechRate}
          onDone={(voiceId, speechRate) => {
            const next = { ...profile, voices: { ...profile.voices, [tutorLang]: voiceId }, speechRate };
            update(next);
            setStep(next.screenLanguage && next.consentAt ? "tutor" : "phone");
          }}
        />
      )}
      {step === "phone" && (
        <PhoneStep
          t={t}
          tutorLanguage={appLang}
          onPick={(code) => {
            update({ screenLanguage: code });
            setStep("mic");
          }}
        />
      )}
      {step === "mic" && <MicStep t={t} onDone={() => setStep("consent")} />}
      {step === "consent" && (
        <ConsentStep
          t={t}
          onAgree={(recordingOptIn) => {
            update({ consentAt: new Date().toISOString(), consentVersion: 1, recordingOptIn });
            setStep("tutor");
          }}
        />
      )}
      {step === "tutor" && profile.screenLanguage && me.user && (
        <TutorRoom
          t={t}
          me={me}
          onSignedOut={() => {
            setMe({ ...me, user: null, paid: false, trial: null });
            setStep("login");
          }}
          tutorLanguage={tutorLang}
          screenLanguage={profile.screenLanguage}
          onChangeLanguage={() => setStep("appLanguage")}
          voiceId={profile.voices?.[tutorLang]}
          speechRate={profile.speechRate}
          onChangeVoice={() => setStep("voice")}
        />
      )}
    </main>
  );
}

/** Next unfinished onboarding step for a signed-in learner: voice, then phone/mic/consent, then tutor. */
function nextStep(p: Profile, tutorLanguage: LanguageCode): Step {
  if (!p.voices?.[tutorLanguage]) return "voice";
  return p.screenLanguage && p.consentAt ? "tutor" : "phone";
}

/** First screen: the app's own language. Each option and heading in its own script, Telugu first. */
function AppLanguageStep({
  selected,
  onPick,
}: {
  selected?: LanguageCode;
  onPick: (code: LanguageCode) => void;
}) {
  const langs = availableLanguages();
  return (
    <>
      <div className="stack">
        {langs.map((l) => (
          <h1 key={l.code} lang={l.code} style={{ fontSize: "1.2rem", margin: 0 }}>
            {strings(l.code).appLanguageTitle}
          </h1>
        ))}
      </div>
      <LanguageButtons selected={selected} onPick={onPick} />
    </>
  );
}

/** Second screen: the language the teacher speaks, asked in the app language just chosen. */
function TutorLanguageStep({
  t,
  selected,
  onPick,
}: {
  t: Strings;
  selected?: LanguageCode;
  onPick: (code: LanguageCode) => void;
}) {
  return (
    <>
      <h1>{t.tutorLanguageTitle}</h1>
      <p className="muted">{t.tutorLanguageHint}</p>
      <LanguageButtons selected={selected} onPick={onPick} />
    </>
  );
}

function LanguageButtons({ selected, onPick }: { selected?: LanguageCode; onPick: (code: LanguageCode) => void }) {
  return (
    <div className="stack">
      {availableLanguages().map((l) => (
        <button
          key={l.code}
          lang={l.code}
          className="btn secondary choice"
          aria-pressed={selected === l.code}
          onClick={() => onPick(l.code)}
        >
          {l.name.native}
          {l.code !== "en" && <small>{l.name.en}</small>}
        </button>
      ))}
    </div>
  );
}
