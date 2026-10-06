const lines:Record<string,string>={Q_alkali:'クオルシア アルカリ',Q_first_agent:'クオルシア第1剤',BL_acid:'BLアシッド',BL_alkali_acid_mix:'BLアルカリ＋アシッド'};
const productNames:Record<string,string>={BLEACH_Q:'クオルシアブリーチ',BLEACH_Q_HIGH:'クオルシアハイブリーチ',BLEACH_BL_POWDER:'BLパウダーブリーチ'};
export function ruleScope(value:Record<string,unknown>):string[] {
  return Object.entries(value).map(([key,v])=>{
    switch(key){case 'line':return lines[String(v)]??String(v);case 'level_max':return `${v}LV以下`;case 'level':return `${v}LV`;case 'edition':return `資料の版：${v}`;case 'product_id':return productNames[String(v)]??String(v);case 'condition':return `条件：${v}`;case 'purpose':return `目的：${v}`;case 'mode':return 'アクセントカラーとしての添加';case 'not_inferred_for':return `適用を未確認：${(v as string[]).map(x=>productNames[x]??x).join('、')}`;default:return String(v);}
  });
}
export function ruleValues(value:Record<string,unknown>):string[] {
  return Object.entries(value).map(([key,v])=>{
    switch(key){case 'ratio':return `第1剤：第2剤＝${(v as number[]).join('：')}`;case 'ratio_basis':return v===null?'比率の質量／体積基準：未記載':`比率の基準：${v}`;case 'developer_family':return 'BLカラー第2剤を指定';case 'pH':return `混合時pH：${v}`;case 'pH_semantics':return String(v);case 'developer_percent_label':return `第2剤の濃度表記：${v}%`;case 'lift_claim':return String(v);case 'acid_addition_percent_range':return `アシッド添加：${(v as number[]).join('〜')}%`;case 'percent_basis':return v===null?'添加率の分母：未定義':String(v);case 'manufacturer_pH_range':return `メーカー記載pH：${(v as number[]).join('〜')}`;case 'tone_up':return `トーンアップ：${(v as string[]).join('、')}`;case 'tone_down':return `トーンダウン：${(v as string[]).join('、')}`;case 'powder_developer_ratio':return `パウダー：第2剤＝${(v as number[]).join('：')}`;case 'time_min_range':return `推奨放置時間：${(v as number[]).join('〜')}分`;default:return String(v);}
  });
}
const recipes:Record<string,string>={
  'Q basic Orange':'クオルシアカラークリーム オレンジ','Q basic Red':'クオルシアカラークリーム レッド',
  'Q BlackBooster1':'クオルシア ブラックブースター1','Q Brown9/Low':'クオルシア ブラウン9/Low','Q WhiteBeige13/Low':'クオルシア ホワイトベージュ13/Low',
  'BL P8':'BL ピンク P8','BL Clear (edition unresolved)':'BLクリア（製品版は未確認）','Q AquaBlue7':'クオルシア アクアブルー7','Q UltraViolet6':'クオルシア ウルトラバイオレット6','Q NavyBlue5':'クオルシア ネイビーブルー5','BL 4MT':'BL モノトーン4MT'
};
export const recipeName=(label:string)=>recipes[label]??label;
