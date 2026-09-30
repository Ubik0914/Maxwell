/**
 * Reading a Nippon Decimal Classification number as a genre.
 *
 * The first digit is one of ten classes (文学, 社会科学…), which is what
 * the shelf is filtered by; the first two are one of a hundred
 * divisions (英米文学, 経済…), which is what a book's detail names. The
 * labels are the NDC's own headings, shortened to their first term.
 */

const CLASSES = [
  "総記",
  "哲学・宗教",
  "歴史・地理",
  "社会科学",
  "自然科学",
  "技術・工学",
  "産業",
  "芸術・スポーツ",
  "言語",
  "文学",
] as const;

const DIVISIONS: Record<string, string> = {
  "00": "総記",
  "01": "図書館・図書館情報学",
  "02": "図書・書誌学",
  "03": "百科事典",
  "04": "一般論文集",
  "05": "逐次刊行物",
  "06": "団体・博物館",
  "07": "ジャーナリズム・新聞",
  "08": "叢書・全集",
  "09": "貴重書・特別コレクション",
  "10": "哲学",
  "11": "哲学各論",
  "12": "東洋思想",
  "13": "西洋哲学",
  "14": "心理学",
  "15": "倫理学",
  "16": "宗教",
  "17": "神道",
  "18": "仏教",
  "19": "キリスト教",
  "20": "歴史・世界史",
  "21": "日本史",
  "22": "アジア史",
  "23": "ヨーロッパ史",
  "24": "アフリカ史",
  "25": "北アメリカ史",
  "26": "南アメリカ史",
  "27": "オセアニア史",
  "28": "伝記",
  "29": "地理・紀行",
  "30": "社会科学",
  "31": "政治",
  "32": "法律",
  "33": "経済",
  "34": "財政",
  "35": "統計",
  "36": "社会",
  "37": "教育",
  "38": "風俗習慣・民俗学",
  "39": "国防・軍事",
  "40": "自然科学",
  "41": "数学",
  "42": "物理学",
  "43": "化学",
  "44": "天文学・宇宙科学",
  "45": "地球科学",
  "46": "生物科学",
  "47": "植物学",
  "48": "動物学",
  "49": "医学・薬学",
  "50": "技術・工学",
  "51": "建設工学・土木工学",
  "52": "建築学",
  "53": "機械工学",
  "54": "電気工学",
  "55": "海洋工学・船舶工学",
  "56": "金属工学・鉱山工学",
  "57": "化学工業",
  "58": "製造工業",
  "59": "家政学・生活科学",
  "60": "産業",
  "61": "農業",
  "62": "園芸",
  "63": "蚕糸業",
  "64": "畜産業",
  "65": "林業",
  "66": "水産業",
  "67": "商業",
  "68": "運輸・交通・観光",
  "69": "通信事業",
  "70": "芸術・美術",
  "71": "彫刻",
  "72": "絵画・書道",
  "73": "版画",
  "74": "写真・印刷",
  "75": "工芸",
  "76": "音楽・舞踊",
  "77": "演劇・映画",
  "78": "スポーツ・体育",
  "79": "諸芸・娯楽",
  "80": "言語",
  "81": "日本語",
  "82": "中国語・東洋の言語",
  "83": "英語",
  "84": "ドイツ語",
  "85": "フランス語",
  "86": "スペイン語",
  "87": "イタリア語",
  "88": "ロシア語",
  "89": "その他の言語",
  "90": "文学",
  "91": "日本文学",
  "92": "中国文学・東洋文学",
  "93": "英米文学",
  "94": "ドイツ文学",
  "95": "フランス文学",
  "96": "スペイン文学",
  "97": "イタリア文学",
  "98": "ロシア文学",
  "99": "その他の文学",
};

/**
 * Sections whose name matters more than their division's: comics sit in
 * 726 under 絵画, which is not what anyone calls a shelf of manga.
 */
const SECTIONS: Record<string, string> = {
  "726": "マンガ・絵本",
};

export interface Genre {
  /** The class digit, "0"–"9": what the shelf filters by. */
  classCode: string;
  /** The class's name: 文学, 社会科学… */
  className: string;
  /** The division's (or section's) name: 英米文学, 経済… */
  name: string;
}

/** The genre an NDC number stands for, or null for none or nonsense. */
export function ndcGenre(ndc: string | null | undefined): Genre | null {
  const digits = ndc
    ?.normalize("NFKC")
    .trim()
    .match(/^([0-9])([0-9])([0-9])/);
  if (!digits) return null;
  const [, first, second, third] = digits;
  return {
    classCode: first,
    className: CLASSES[Number(first)],
    name: SECTIONS[first + second + third] ?? DIVISIONS[first + second] ?? "",
  };
}

/** The class's name for its digit, for a filter's label. */
export function ndcClassName(classCode: string): string | null {
  return /^[0-9]$/.test(classCode) ? CLASSES[Number(classCode)] : null;
}
