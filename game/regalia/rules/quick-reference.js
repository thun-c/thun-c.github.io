export const RULE_PANEL = {
  title: "ルール",
  badge: "早見表",
  lead: "盤面を見ながら確認しやすいように、手番で迷いやすい要点だけをまとめています。",
  sections: [
    {
      heading: "目的",
      body: "カードと紋章で威信を集め、誰かが15点以上になったラウンドの終了時に最も点が高いプレイヤーが勝利します。",
    },
    {
      heading: "手番",
      items: [
        "異なる通常マナを3種類取る",
        "場に4枚以上ある同じ通常マナを2枚取る",
        "公開カードを予約し、残っていれば全マナを1枚得る",
        "公開カードか予約カードを1枚スカウトする",
      ],
    },
    {
      heading: "マナ",
      media: {
        type: "image-strip",
        label: "通常マナ5種と全マナ",
        images: [
          { src: "assets/mana-icons/white.webp", alt: "光" },
          { src: "assets/mana-icons/blue.webp", alt: "雷" },
          { src: "assets/mana-icons/green.webp", alt: "精" },
          { src: "assets/mana-icons/red.webp", alt: "炎" },
          { src: "assets/mana-icons/black.webp", alt: "闇" },
          { src: "assets/mana-icons/gold.webp", alt: "全" },
        ],
      },
      items: [
        "全マナは支払い時に任意の1種類として使える",
        "手番終了時、手元のマナは合計10枚まで",
      ],
    },
    {
      heading: "紋章",
      items: [
        "条件に必要なのはスカウト済みカードの兵だけ",
        "条件を満たした手番終了時に獲得できる",
        "同時に複数満たしても、その手番で獲得できるのは1枚",
      ],
    },
  ],
};
