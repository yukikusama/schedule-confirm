"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (opts: { prompt: string }) => void };
        };
      };
    };
  }
}

const CLIENT_ID = "258100577056-aqs0c8aopdse7o1fd67ds1f64hmqr3to.apps.googleusercontent.com";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export default function LandingPage() {
  const tokenClientRef = useRef<{ requestAccessToken: (opts: { prompt: string }) => void } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const init = () => {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
          if (response.access_token && !response.error) {
            window.location.href = "/app";
          } else {
            setChecking(false);
          }
        },
      });
      // すでにログイン済みなら自動で /app へ
      tokenClientRef.current.requestAccessToken({ prompt: "" });
    };

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.body.appendChild(script);
  }, []);

  const handleLogin = () => {
    tokenClientRef.current?.requestAccessToken({ prompt: "select_account" });
  };

  if (checking) {
    return <div className={styles.page} />;
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.logo}>Sukima</p>
        <h1 className={styles.tagline}>
          あなたの心の隙間、<br />お埋めします。
        </h1>
        <p className={styles.sub}>（カレンダーの隙間も）</p>
        <button onClick={handleLogin} className={styles.cta}>
          Googleでログイン
        </button>
      </section>

      <section className={styles.features}>
        <div className={styles.feature}>
          <span className={styles.icon}>🔍</span>
          <h3>全員のカレンダーを強制捜査</h3>
          <p>参加者全員のGoogleカレンダーからbusyな時間帯を根こそぎ収集します。</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.icon}>✨</span>
          <h3>奇跡の隙間を発掘</h3>
          <p>全員が奇跡的に空いている時間帯を自動で算出します。あればね。</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.icon}>📅</span>
          <h3>秒速で予定を作成</h3>
          <p>空き時間を選んでそのままGoogleカレンダーに予定を突っ込みます。</p>
        </div>
      </section>

      <section className={styles.targets}>
        <h2 className={styles.sectionTitle}>こんな人に使ってほしい</h2>
        <ul className={styles.targetList}>
          <li>青木さんと松田さんと九島さんと、、、etcの予定調整に飽きた人</li>
          <li>調整さんとのやりとりで消耗した人</li>
          <li>会議調整に人生の何%かを溶かしている人</li>
          <li>心の隙間を抱えているすべての人</li>
        </ul>
      </section>

      <section className={styles.faq}>
        <h2 className={styles.sectionTitle}>よくある質問</h2>
        <div className={styles.faqItem}>
          <p className={styles.question}>本当に心の隙間は埋まりますか？</p>
          <p className={styles.answer}>カレンダーの隙間は確実に埋まります。</p>
        </div>
        <div className={styles.faqItem}>
          <p className={styles.question}>無料ですか？</p>
          <p className={styles.answer}>はい。心の隙間のサイズによりません。</p>
        </div>
        <div className={styles.faqItem}>
          <p className={styles.question}>隙間が見つからなかった場合は？</p>
          <p className={styles.answer}>それはSukimaではなくあなたのチームの問題です。</p>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>© Sukima — あなたの心の隙間、お埋めします。</p>
      </footer>
    </div>
  );
}
