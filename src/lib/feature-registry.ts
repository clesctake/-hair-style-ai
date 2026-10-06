/** Feature state is independent of value provenance and generation job status. */
export const featureStates = ['REAL', 'ESTIMATE', 'MOCK', 'PARTIAL', 'UNIMPLEMENTED'] as const;
export type FeatureState = typeof featureStates[number];
export const featureRegistryVersion = 'phase4-features-v1';

export type FeatureDefinition = {
  state: FeatureState;
  label: string;
  working: string;
  missing: string;
};

const feature = (state: FeatureState, label: string, working: string, missing = ''): FeatureDefinition =>
  Object.freeze({ state, label, working, missing });

export const FeatureRegistry = Object.freeze({
  commonDataArchitecture: feature('REAL', '共通データ基盤', '同一セッションID、参照・出所・版の管理'),
  legacyAdapter: feature('REAL', '既存データ互換', '旧Journeyを残す読込・保存adapter'),
  sessionPersistence: feature('REAL', 'カルテ保存', '端末／メモリで共通モデルと旧形式を同時保存', 'クラウド同期・iOS実機検証'),
  standardizedCapture: feature('PARTIAL', '4方向撮影', 'カメラ・ライブラリ・ガイド・採用UI', 'iPhone/iPad実機検証・距離の実測'),
  currentPhotoAnalysisInput: feature('REAL', '元画像からの解析入力', '4方向の元画像・表示画像・撮影情報を解決。欠損元画像を明示して除外', '旧縮小サンプルから元画像の復元は不可'),
  photoQuality: feature('PARTIAL', '撮影品質', '実モデルの髪領域内の露出・白黒クリップ・鮮鋭度・逆光・位置・見切れ・照明差・反射プロキシ', '閾値校正・色かぶり・レンズ曇り・実距離・実機精度評価'),
  hairAnalysis: feature('PARTIAL', '毛髪診断', '髪領域AI推定＋元画像のLab/LCh・画像上のばらつきを保存', 'ダメージ・吸い込みやすさ・白髪率・Lv・残留色素量は美容師確認／null'),
  stylistHairCorrection: feature('REAL', '美容師の毛髪補正', 'AI原本と別の追記データ'),
  faceLandmarkDetection: feature('ESTIMATE', '顔ランドマーク検出', 'MediaPipe実モデルの顔表面ランドマーク。正面・左右、複数人物を区別', '真横・顔隠れ・低品質画像では未取得。iOS実機未検証'),
  faceBoneAnalysis: feature('PARTIAL', '顔・骨格分析', '正面ランドマークから画像上の顔幅・高さ・目・眉・鼻・顎・頬付近の位置関係', '物理骨格寸法・額・生え際・頭部形状・3D骨格はnull'),
  styleTarget: feature('REAL', 'STYLE設定', '髪型参考とパラメータをCOLORから分離'),
  colorTarget: feature('REAL', 'COLOR設定', 'カラー参考と調整・確定履歴をSTYLEから分離'),
  liveColorAdjustment: feature('REAL', '髪だけのライブ色調整', '手動マスク内をCanvasで補正', '自動髪抽出・実毛髪の発色保証'),
  automaticHairSegmentation: feature('PARTIAL', '自動髪領域抽出', 'MediaPipe HairSegmenter実推論・マスク保存・美容師による修正', '正面セルフィー用モデル。後頭部・細い毛・全髪型の精度検証、部位は候補区切り'),
  targetColorConfirmation: feature('REAL', 'ターゲット色確定', '調整値・未校正採色Lab・時刻・プレビューを保存'),
  perceptualColorMath: feature('REAL', '色空間・色差演算', 'RGB/Lab/LCh・ΔE76の演算', '撮影条件の校正'),
  fioleLibrary: feature('REAL', 'FIOLEライブラリ', '既存の73資料項目・149色番・15軸を保持'),
  recipeCandidates: feature('PARTIAL', 'FIOLE候補検索', '図上構成の候補順位とg換算', '比率はMOCK、発色・リフトの探索なし'),
  designPlanning: feature('PARTIAL', 'デザイン設計エンジン', '実効顔比率・美容師確認の毛髪/STYLE条件から未検証ルールで5方向を設計', '学習済み似合わせモデル・STYLE写真の形状抽出・精度検証'),
  boneDesignConnection: feature('REAL', '骨格値→デザイン接続', '美容師修正を優先し、実使用値・キー・原本IDを保存', '顔比率は2D画像推定、物理骨格ではない'),
  bangParameterGeneration: feature('ESTIMATE', 'A〜Eパラメータ設計', 'AI画像推定に設計ルールを適用した試案。10パラメータと根拠', '設計ルールは未検証。confidenceは入力充足度で似合う確率ではない'),
  parentChildDesignData: feature('REAL', 'MAINと子デザインの関係', 'MAIN親ID、A〜E、長さ5種の構造・検証', '画像生成そのものは別機能'),
  bangFaceFramePlanning: feature('PARTIAL', '前髪・顔周り案', '実分析値から5方向を設計、簡易構造プレビュー・編集・採用', '本人実写プレビュー・自動STYLE形状理解'),
  legacyBangTemplates: feature('MOCK', '以前の固定前髪案', '旧A〜Eと保存履歴を互換機能として保持'),
  bangStylistCorrection: feature('REAL', '前髪案の美容師補正', '原案・編集中・採用値を分離保存'),
  generationContract: feature('REAL', '画像生成用データ契約', '本人・形・色・骨格・設計を役割別に参照', '実画像API・iOS実機での検証'),
  generationBatchContract: feature('REAL', 'MAIN→A〜E生成契約', '採用/補正パラメータ・親ID・出所・同一STYLE/COLORを引継ぎ', '実画像APIの画質未検証。取得できないseedはnull'),
  mainDesignGeneration: feature('PARTIAL', 'MAIN DESIGN生成', '正式契約→既存API・本人元画像/STYLE/確定COLOR・ジョブ保存', 'APIキー未設定。実生成・本人維持・画質は未検証'),
  bangFaceFrameGeneration: feature('PARTIAL', '本人実写A〜E生成', '保存したMAIN親画像からIMAGE_EDITで5案・比較・個別再試行', '実APIの本人/STYLE/COLOR一貫性と画質は未検証'),
  batchSimulation: feature('PARTIAL', 'MAIN＋5案一括生成', '順次ジョブ・部分失敗・1案だけの修正再生成・保存', '実API生成6枚は未検証'),
  simulationJobManagement: feature('REAL','生成ジョブ・追記履歴','MAIN依存・親bytes・保存・STALE・採用・上限付き手動再試行','永続サーバージョブは未実装'),
  simulationQuality: feature('PARTIAL','生成画像の確認','画像形式・契約整合性・美容師確認/不採用','自動本人/背景/色/前髪差の品質評価と実API画像確認'),
  lengthVariationGeneration: feature('UNIMPLEMENTED', '長さ5種の実写比較', '長さキー・親IDのモデルのみ', '実写の5画像生成・実寸校正'),
  requiredUnderCalculator: feature('UNIMPLEMENTED', '必要アンダー逆算', '手入力値の保管のみ', '検証済みデータからの逆算'),
  liftRouteCalculator: feature('UNIMPLEMENTED', 'リフトルート判定', '正式enumと美容師選択の保管のみ', '自動判定・ブリーチ回数予測'),
  preLiftPrediction: feature('UNIMPLEMENTED', 'PRE-LIFT予測', '手入力予想値の保管のみ', '毛髪・薬剤・OXからの予測'),
  onColorCalculation: feature('UNIMPLEMENTED', 'ON COLOR計算', '予測UNDERと目標の参照のみ', '発色予測・デポジット・補色量の計算'),
  fioleRecipeOptimization: feature('UNIMPLEMENTED', 'FIOLE配合最適化', '', '発色モデルを用いる再探索'),
  treatmentRecord: feature('REAL', '提案／施術結果記録', '提案と実使用、PRE-LIFTとON COLOR、Afterを別保存'),
  empiricalLearning: feature('UNIMPLEMENTED', '実績補正モデル', '学習素材の保存モデルのみ', '教師データ化・学習・評価・推論'),
  customerTakeaway: feature('UNIMPLEMENTED', 'お持ち帰り提案', 'v1.1型契約・将来RESULTタブの設計のみ', '画面・出力・共有'),
  productCatalog: feature('UNIMPLEMENTED', 'サロン商品台帳', 'v1.1型契約のみ', '登録・編集・商品保存'),
  nextColorOptions: feature('UNIMPLEMENTED', '次回カラー5案', '状態・履歴・実現可能性の依存契約のみ', '推薦エンジン'),
  nextDesignOptions: feature('UNIMPLEMENTED', '次回前髪・顔周り', '次回長さを再評価する契約のみ', '再設計'),
  makeupSuggestions: feature('UNIMPLEMENTED', 'メイク提案', 'lip/cheek/eye型契約のみ', '推薦・実写比較'),
  productRecommendation: feature('UNIMPLEMENTED', '商品推薦と理由', 'AI提案・美容師選択/編集を分離する契約のみ', '推薦・文章生成・販売/共有連携'),
} satisfies Record<string, FeatureDefinition>);

export type FeatureId = keyof typeof FeatureRegistry;
export type FeatureSnapshot = {
  registryVersion: string;
  states: Record<FeatureId, FeatureState>;
};
export const featureSnapshot = (): FeatureSnapshot => ({
  registryVersion: featureRegistryVersion,
  states: Object.fromEntries(Object.entries(FeatureRegistry).map(([id, item]) => [id, item.state])) as Record<FeatureId, FeatureState>,
});
