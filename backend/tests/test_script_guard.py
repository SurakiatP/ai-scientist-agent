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


def test_question_script_is_allowed():
    assert stray("CRISPRは遺伝子編集の技術です", "CRISPRとは何ですか", "") == []
    assert stray("유전자 편집 기술입니다", "CRISPR란 무엇인가요", "") == []
    assert stray("Это метод редактирования", "Что такое CRISPR?", "") == []


def test_unrelated_script_still_flagged():
    assert stray("CRISPRは技術です במחקר", "CRISPRとは何ですか", "") == ["במחקר"]
    assert stray("Это метод 연구", "Что такое CRISPR?", "") == ["연구"]


def test_quoted_term_does_not_open_the_whole_script():
    assert stray("คำว่า 日本語 และ 東京", "ศึกษา CRISPR ในภาษา 日本語 อย่างไร", "") == ["東京"]


def test_single_letter_does_not_open_a_script():
    assert stray("жук", "Is ж a letter?", "") == ["жук"]


def test_kana_and_kanji_are_one_family():
    assert stray("タンパク質の構造", "東京大学の研究について", "") == []
