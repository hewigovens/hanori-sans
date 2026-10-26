import Foundation

enum PreviewFace: String, CaseIterable, Identifiable {
    case standard = "Hanori Sans"
    case furigana = "Hanori Sans Furigana"

    var id: Self { self }
    var fileName: String {
        self == .standard ? "HanoriSans-Regular" : "HanoriSansFurigana-Regular"
    }
    var subtitle: String {
        self == .standard ? "Readings follow the language hint" : "Readings always enabled"
    }
}

enum LanguageHint: String, CaseIterable, Identifiable {
    case kana = "Kana hint"
    case unspecified = "No hint"
    case english = "English"
    case chinese = "Simplified Chinese"
    case japanese = "Japanese"

    var id: Self { self }

    func language(for paragraph: String) -> String? {
        switch self {
        case .kana: return Self.containsKana(paragraph) ? "ja" : nil
        case .unspecified: return nil
        case .english: return "en"
        case .chinese: return "zh-Hans"
        case .japanese: return "ja"
        }
    }

    private static func containsKana(_ text: String) -> Bool {
        text.unicodeScalars.contains { scalar in
            switch scalar.value {
            case 0x3041...0x3096, 0x309D...0x309F,
                 0x30A1...0x30FA, 0x30FD...0x30FF,
                 0x31F0...0x31FF, 0xFF66...0xFF9D,
                 0x1B000...0x1B122:
                return true
            default: return false
            }
        }
    }

    var explanation: String {
        switch self {
        case .kana:
            return "Each paragraph with hiragana or katakana gets a Japanese hint. Han-only paragraphs stay untagged. This is a reading aid, not reliable language detection."
        case .unspecified:
            return "No language hint is sent. Hanori Sans stays plain, matching the observed English-mode LINE behavior."
        case .japanese:
            return "All text gets a Japanese hint. Shared Chinese words may also receive Japanese readings."
        case .english, .chinese:
            return "Hanori Sans stays plain. Hanori Sans Furigana can still add readings to dictionary matches in either language."
        }
    }
}

struct PreviewSettings: Equatable {
    var text = SampleText.mixed.text
    var hint = LanguageHint.kana
    var pointSize = 32.0
    var lineHeight = 1.9
    var showBaselines = false
}

enum SampleText: String, CaseIterable, Identifiable {
    case mixed = "Mixed languages"
    case chinese = "Simplified Chinese"
    case japanese = "Japanese"
    case english = "English"
    case ambiguous = "Shared Han words"

    var id: Self { self }
    var text: String {
        switch self {
        case .mixed:
            return "A quiet morning. Let's read together.\n今天的中文字体清晰，汉字宽度保持一致。\n今日は日本語の勉強をします。東京駅で友達に会います。"
        case .chinese:
            return "今天的中文字体清晰，汉字宽度保持一致。\n我们一起阅读，看看标点、数字 0123456789 和 English 的搭配。\n周末一起去公园散步，顺路喝杯咖啡。"
        case .japanese:
            return "今日は日本語の勉強をします。\n東京駅で友達に会います。カタカナとひらがな。\n明日の朝、一緒にコーヒーを飲みませんか。"
        case .english:
            return "A quiet morning. Let's read together.\nIl1  O0  0123456789  a g R  /  office & café\nThe quick brown fox jumps over the lazy dog."
        case .ambiguous:
            return "今日 日本 東京 学生\n今日は日本語を読みます。\n今天一起阅读中文。"
        }
    }
}
