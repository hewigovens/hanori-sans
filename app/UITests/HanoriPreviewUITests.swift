import XCTest

final class HanoriPreviewUITests: XCTestCase {
    #if os(iOS)
    func testTextAndAppearanceSheetsUpdatePreview() {
        let app = XCUIApplication()
        app.launch()
        app.buttons["edit-text"].tap()
        let editor = app.textViews["preview-text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        app.buttons["samples"].tap()
        app.buttons["Simplified Chinese"].tap()
        XCTAssertTrue((editor.value as? String)?.contains("周末") == true)
        editor.tap()
        editor.typeText("\nHello from Hanori")
        let textSheet = XCTAttachment(screenshot: app.screenshot())
        textSheet.name = "Hanori text editor"
        textSheet.lifetime = .keepAlways
        add(textSheet)
        app.buttons["text-done"].tap()

        let preview = app.descendants(matching: .any).matching(identifier: "HanoriSans-Regular-specimen").firstMatch
        XCTAssertTrue(preview.label.contains("Hello from Hanori"))
        app.buttons["appearance"].tap()
        app.buttons["language-hint"].tap()
        app.buttons["Japanese"].tap()
        app.sliders["font-size"].adjust(toNormalizedSliderPosition: 0.6)
        let appearance = XCTAttachment(screenshot: app.screenshot())
        appearance.name = "Hanori appearance controls"
        appearance.lifetime = .keepAlways
        add(appearance)
        app.buttons["appearance-done"].tap()
        XCTAssertTrue(app.staticTexts["appearance-summary"].label.contains("Japanese"))
        let result = XCTAttachment(screenshot: app.screenshot())
        result.name = "Hanori configured preview"
        result.lifetime = .keepAlways
        add(result)
    }
    #endif

    func testSerifSelectionAndRendering() {
        let app = XCUIApplication()
        app.launch()
        #if os(macOS)
        app.activate()
        let serif = app.radioButtons["Serif"]
        #else
        let serif = app.segmentedControls["typeface"].buttons["Serif"]
        #endif
        XCTAssertTrue(serif.waitForExistence(timeout: 10))
        #if os(macOS)
        serif.click()
        #else
        serif.tap()
        #endif
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "HanoriSerif-Regular-specimen").firstMatch.waitForExistence(timeout: 5))
        let first = XCTAttachment(screenshot: app.screenshot())
        first.name = "Hanori Serif on device"
        first.lifetime = .keepAlways
        add(first)
        let scroll = app.scrollViews.allElementsBoundByIndex.last
        XCTAssertNotNil(scroll)
        #if os(macOS)
        scroll?.scroll(byDeltaX: 0, deltaY: -420)
        #else
        scroll?.swipeUp()
        #endif
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "HanoriSerifFurigana-Regular-specimen").firstMatch.exists)
        let second = XCTAttachment(screenshot: app.screenshot())
        second.name = "Hanori Serif Furigana on device"
        second.lifetime = .keepAlways
        add(second)
    }
}
