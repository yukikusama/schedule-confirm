import Link from "next/link";
import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.logo}>Sukima</p>
        <h1 className={styles.tagline}>
          あなたの心の隙間、<br />お埋めします。
        </h1>
        <p className={styles.sub}>（カレンダーの隙間も）</p>
        <Link href="/app" className={styles.cta}>
          隙間を探しに行く →
        </Link>
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
