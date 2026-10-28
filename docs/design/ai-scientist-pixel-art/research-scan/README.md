# Research Scan — pixel art loop

ภาพเครื่องสแกนเอกสารวิจัย 8 เฟรมสำหรับ AI Scientist อ้างอิงธีม Obsidian / Arctic Teal; เน้นบรรยากาศการค้นคว้า โดยไม่มีตราองค์กรและไม่มีข้อความบนภาพ. เป็น asset สำหรับทดลองออกแบบ ยังไม่ได้ติดตั้งลงในแอป

## ไฟล์

- `research-scan.mp4` — วิดีโอ H.264, 528 × 528 px, 4 fps, 2 วินาที, ไม่มีเสียง
- `research-scan.webm` — วิดีโอ VP9 ขนาดเล็กสำหรับเว็บ, 528 × 528 px, 4 fps, 2 วินาที, ไม่มีเสียง
- `research-scan.gif` — ภาพเคลื่อนไหววนลูปสำหรับ preview
- `frames/frame-01.png` ถึง `frame-08.png` — เฟรมเรียงตามเวลาที่ 4 fps
- `sprite-sheet.png` — ภาพต้นทางที่สร้างด้วย imagegen และนำมาแยกเฟรม

## ตำแหน่งที่แนะนำ

วางเป็นภาพประกอบขนาดเล็กใน **หน้าแชต ระหว่าง Deep Research กำลังค้นหา/อ่านแหล่งข้อมูล** ใกล้ข้อความสถานะหรือรายการขั้นตอน เพื่อช่วยให้ช่วงรอมีชีวิตชีวา; ให้ข้อความและสถานะจริงจาก backend เป็นข้อมูลหลัก ภาพนี้ไม่ได้แสดง progress จริง และไม่ควรแสดงเมื่อไม่ได้มีงานกำลังดำเนินการ

ใน Light mode ใช้ภาพภายในกรอบพื้น obsidian ขนาดเล็กเพื่อรักษาพื้นหลังเดิมของ asset และตรวจ contrast ของข้อความรอบกรอบ. ปิดเสียงและวนลูปเฉพาะขณะมีงาน; เมื่อเปิด `prefers-reduced-motion` ให้แสดง `frames/frame-01.png` แทน. บนมือถือให้ลดขนาดและไม่ดันบทสนทนาหรือช่องพิมพ์ออกจากจอ. ทางเลือกสำรองคือแสดงใน empty state ของส่วนแหล่งข้อมูลเมื่อผู้ใช้กำลังนำเข้าเอกสาร แต่ไม่ควรแสดงราวกับกำลังสแกนหากระบบไม่ได้ทำงาน

อย่าวางบน Landing: ทิศทางที่ตกลงไว้ระบุว่า Landing ไม่มีภาพประกอบ

## การสร้าง

สร้างต้นฉบับด้วย built-in imagegen แล้วใช้ FFmpeg แยกเฟรมและประกอบไฟล์วิดีโอ/GIF. Prompt:

> Use case: stylized-concept. Asset type: pixel-art animation sprite sheet for an AI research assistant interface. Create a seamless eight-frame hand-drawn animation as a precisely aligned 4 columns by 2 rows grid. Every cell has exactly equal size, edge-to-edge, no gaps or labels or borders. Each frame shows the exact same fixed scene, camera and objects: a tiny abstract research terminal with an open paper and a small square magnifying lens scanning it; above the document float three little teal square data points. Across eight chronological frames, move only the lens a few pixel steps left to right and the data-point brightness subtly pulses, returning to the first position by frame 8. Render each scene as intentional chunky 16-bit pixel art, perfectly sharp square pixels, clean silhouette, calm understated scholarly mood, no humans or mascots, no text, no logos, no watermarks. Colors strictly dark blue-black obsidian #081923, deep navy #102B37, arctic turquoise #38E0D7, muted teal #087E86 and off-white #E7F4F2. Flat dark blue-black background consistent in every cell. Keep visual composition stable with ample padding; no shading gradients, no blur, no realistic render.

เฟรมจาก imagegen มีรายละเอียดของกระดาษและเครื่องเปลี่ยนเล็กน้อยระหว่างเฟรม หากต้องการลูปที่ทุกพิกเซลคงตำแหน่งแม่นยำ ควรนำภาพนี้ไปสร้าง sprite ที่วาดแต่ละเฟรมด้วยมือก่อนใช้เป็น asset สุดท้าย
