'use client';
import { FeatureRegistry } from '@/lib/feature-registry';
import type { DiagnosisSession } from '@/lib/session-model';

/** Details-only verification surface; the salon home remains unchanged. */
export default function FeatureStatePanel({ session }: { session: DiagnosisSession }) {
  return <section className="salon-panel salon-feature-state"><details><summary>開発・検証 · 機能状態と共通データ</summary>
    <p>仕様 {session.specVersion} · データ版 {session.dataSchemaVersion} · 保存版 {session.revision}</p>
    <p>同じ診断セッションに写真、診断、STYLE、COLOR、デザイン、施術結果を紐づけています。AI解析や5案生成の実装状態は別に管理しています。</p>
    <dl><dt>DiagnosisSession</dt><dd>{session.id}</dd><dt>診断原本と補正</dt><dd>毛髪 {session.hairAnalysis.aiEstimate.length}件 / 美容師補正 {session.hairAnalysis.stylistCorrection.length}件</dd>
      <dt>MAIN → 子デザイン</dt><dd>A〜E {session.designPlan.bangFaceFrameDesigns.length}案 / 長さ {session.designPlan.lengthVariations.length}種（データ構造）</dd>
      <dt>提案と実施</dt><dd>提案 {session.treatmentPlan.proposed.length}件 / 実使用 {session.treatmentResult.actual?.confirmed ? '確認済み' : '未確認'}</dd></dl>
    <div style={{ overflowX: 'auto' }}><table><caption>機能状態 · 現行コード</caption><thead><tr><th>機能</th><th>状態</th><th>動く範囲／未接続</th></tr></thead><tbody>
      {Object.entries(FeatureRegistry).map(([id, feature]) => <tr key={id} data-feature-id={id} data-feature-state={feature.state}><td>{feature.label}</td><td><span className="salon-label">{feature.state}</span></td><td>{feature.working || '未接続'}{feature.missing && <small> · {feature.missing}</small>}</td></tr>)}
    </tbody></table></div>
    {session.compatibility.warnings.length > 0 && <p>{session.compatibility.warnings.join(' ')}</p>}
  </details></section>;
}
