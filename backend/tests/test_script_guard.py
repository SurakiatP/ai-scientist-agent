from scientist.script_guard import stray

HEB = "ผลลัพธ์ **יתרונותที่ דווחו** ในตาราง | במחקר | רצפים |"


def test_hebrew_words_flagged_and_text_untouched():
    assert stray(HEB, "CRISPR base editing กับ prime editing ต่างกันอย่างไร", "") == ["יתרונות", "דווחו", "במחקר", "רצפים"]


def test_term_in_question_or_sources_is_allowed():
    assert stray("คำว่า 日本語 หมายถึง", "日本語 คืออะไร", "") == []
    assert stray("ตามที่ระบุ במחקר", "ถาม", "title: במחקר זה") == []


def test_science_letters_and_normal_thai_not_flagged():
    assert stray("β-catenin ที่ 5 μM, α-helix ผู้ป่วยน้ำ กี่ๆ ปั๊ม", "คำถาม", "") == []
    assert stray("x ก", "q", "") == []  # a single foreign letter is not a run


def test_stacked_thai_marks_flagged():
    assert stray("ภาษิิิไทย", "q", "") == ["ิิิ"]


def test_combining_marks_stay_inside_the_word():
    assert stray("ตอบ हिन्दी भाषा", "q", "") == ["हिन्दी", "भाषा"]
    assert stray("ตอบ مُحَمَّد", "q", "") == ["مُحَمَّد"]
    assert stray("ตอบ שָׁלוֹם", "q", "") == ["שָׁלוֹם"]


def test_math_and_fullwidth_latin_not_flagged():
    assert stray("ตอบ 𝑥𝑦 ＡＢＣ", "q", "") == []
