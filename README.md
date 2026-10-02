# laoit — Content Library ສຳລັບບໍລິການຝຶກອົບຮົມຫຼັກສູດໄອທີ

ແອບເວັບສຳລັບທີມຄອນເທັນ: ອ່ານ context ຂອງແບຣນ → ຫາໄອເດຍຈາກ trend ພ້ອມຂໍ້ມູນຈິງ → ສ້າງ Carousel / Video script → ສົ່ງອະນຸມັດ → ສົ່ງຕໍ່ [Google Flow](https://flow.google.com/).

## ຟີເຈີ

| ຂັ້ນ | ແທັບ | ເຮັດຫຍັງ |
|---|---|---|
| 1 | **Context** | ກຳນົດແບຣນ, ຫຼັກສູດ, ກຸ່ມເປົ້າໝາຍ, ນ້ຳສຽງ, content pillars, do/don't, CTA. ນຳເຂົ້າ brand guideline ຈາກໄຟລ໌ `.txt` / `.md` / `.json` ໄດ້. AI ອ່ານ context ນີ້ທຸກຄັ້ງ. |
| 2 | **ໄອເດຍ & ຂໍ້ມູນ** | Claude ຄົ້ນຫາ trend ທາງເວັບ (web search), ດຶງຂໍ້ເທັດຈິງຈາກແຫຼ່ງທີ່ໜ້າເຊື່ອຖື (WEF, World Bank, Gartner, ເອກະສານທາງການ...) ພ້ອມລິ້ງ. ແຕ່ລະຂໍ້ມີປ້າຍ **✓ ກວດແລ້ວ** ຖ້າ URL ມາຈາກຜົນ search ແທ້, ຫຼື **⚠ ກວດເອງ** ຖ້າບໍ່ກົງ. ເພີ່ມໄອເດຍເອງກໍໄດ້. |
| 3 | **ຄັງຄອນເທັນ** | ສ້າງ **Carousel** (ຫົວຂໍ້ + ເນື້ອຫາແຕ່ລະສະໄລ້ + ອະທິບາຍພາບ + Flow prompt) ຫຼື **Video script** (scene ລະ 8 ວິ + ບົດພາກ + ຂໍ້ຄວາມເທິງຈໍ + Veo prompt). ແກ້ໄຂເອງ ຫຼື ໃຫ້ AI ປັບຕາມຄຳຄິດເຫັນ. ຄົ້ນຫາ/ກັ່ນຕອງຕາມຮູບແບບ ແລະ ສະຖານະ. |
| 4 | **ອະນຸມັດ** | ຄິວລໍຖ້າອະນຸມັດ: ອະນຸມັດ ຫຼື ຂໍໃຫ້ແກ້ໄຂ (ພ້ອມຄຳຄິດເຫັນ). ບັນທຶກປະຫວັດ ແລະ ຊື່ຜູ້ອະນຸມັດ. |
| → | **ສົ່ງ Google Flow** | ເປີດໄດ້ສະເພາະຄອນເທັນທີ່ອະນຸມັດແລ້ວ: copy prompt ແຕ່ລະສະໄລ້/scene, copy ທັງໝົດ, ດາວໂຫຼດ `.txt` / `.json`, ແລະ ປຸ່ມເປີດ Flow (copy prompt ໃຫ້ອັດຕະໂນມັດ + ບັນທຶກສະຖານະ "ສົ່ງ Flow ແລ້ວ"). |

ສະຖານະ: `ຮ່າງ → ລໍຖ້າອະນຸມັດ → ອະນຸມັດແລ້ວ → ສົ່ງ Flow ແລ້ວ` (ຫຼື `→ ຕ້ອງແກ້ໄຂ → ຮ່າງ`). ຖ້າແກ້ໄຂຄອນເທັນທີ່ອະນຸມັດແລ້ວ ມັນຈະກັບເປັນຮ່າງ ແລະ ຕ້ອງອະນຸມັດໃໝ່.

> **ໝາຍເຫດ Google Flow:** Flow ຍັງບໍ່ມີ public API, ສະນັ້ນແອບສົ່ງຕໍ່ແບບ "Flow package" (prompt ພ້ອມໃຊ້ + aspect ratio + mode) ໃຫ້ copy ໄປວາງໃນ Flow. Prompt ຂຽນເປັນພາສາອັງກິດ ແລະ ບໍ່ໃສ່ຕົວອັກສອນໃນພາບ ເພາະ AI ສ້າງຕົວອັກສອນລາວບໍ່ຖືກ — ໃຫ້ວາງຂໍ້ຄວາມລາວທີຫຼັງໃນ Canva / Figma / CapCut.

## ການຕິດຕັ້ງ

ຕ້ອງການ Node.js 20+ ແລະ [Claude API key](https://console.anthropic.com/).

```bash
npm install
cp .env.example .env   # ແລ້ວໃສ່ ANTHROPIC_API_KEY
npm start              # http://localhost:3000
```

ຕົວປ່ຽນ environment:

| ຕົວປ່ຽນ | ຄ່າເລີ່ມຕົ້ນ | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | ຈຳເປັນ |
| `PORT` | `3000` | |
| `CLAUDE_MODEL` | `claude-opus-5-5` | |
| `DATA_FILE` | `data/db.json` | ບ່ອນເກັບຂໍ້ມູນ (JSON) |

## ໂຄງສ້າງ

```
server.js        Express API + workflow ການອະນຸມັດ
lib/ai.js        Claude: research (web search) + ສ້າງ/ປັບ carousel & video (structured outputs)
lib/flow.js      ສ້າງ Flow package ຈາກຄອນເທັນທີ່ອະນຸມັດ
lib/store.js     ເກັບຂໍ້ມູນໃນໄຟລ໌ JSON
public/          ໜ້າເວັບ (HTML/CSS/JS ທຳມະດາ, ພາສາລາວ)
test/            npm test
```

ການຫາໄອເດຍໃຊ້ 2 ຂັ້ນ: (1) Claude ຄົ້ນຫາເວັບ ແລະ ຂຽນບັນທຶກ, (2) ຈັດເປັນ JSON ໂດຍອະນຸຍາດໃຫ້ອ້າງສະເພາະ URL ທີ່ search ພົບແທ້ — ແລ້ວ server ກວດ URL ຂອງແຕ່ລະຂໍ້ເທັດຈິງອີກຄັ້ງ.
