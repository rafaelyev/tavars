# TAVAR'S — Offline do'kon boshqaruvi

Fayllarni bitta papkaga chiqarib, `index.html` faylini oching. Dastur ma'lumotlarni brauzerning localStorage xotirasida saqlaydi.

Asosiy imkoniyatlar:
- Sotuv yakunida mijoz bergan pulni kiritish va qaytimni avtomatik hisoblash.
- Sotuv, qo'shimcha daromad, xarajat va tovar xaridlarini alohida hisoblash.
- Har xil olish narxidagi bir xil nomli tovarlarni alohida dublikat sifatida saqlash.
- Mahsulot yoki dublikat 0 dona bo'lsa ham omborda saqlanadi; 0 dona mahsulot sotuvga chiqarilmaydi, ammo tarix va pozitsiya yo'qolmaydi. Qayta zaxira qo'shilganda yana ishlaydi.
- Oy va hafta bo'yicha arxiv.
- Haftalik pul hisoboti har hafta dushanbadan yakshanbagacha avtomatik yangilanadi.
- Pul/narx maydonlarida har 3 xonadan keyin nuqta avtomatik qo'yiladi (masalan, 1.250.000).
- Kun/tun rejimi.
- JSON backup eksport/import.

Muhim: brauzer ma'lumotlarini o'chirishdan oldin `JSON eksport` orqali backup oling.

v16: pul maydonlari oynalarda ham avtomatik formatlanadi; Arxivda bo'sh sana xatosi tuzatildi; dashboard hisob-kitoblari (qarz, ustunlar, ogohlantirish) to'g'rilandi; qidiruv va bildirishnoma ishlaydi; yangi dizayn (o'ng panel, och mavzu default).
