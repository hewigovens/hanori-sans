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
        let textSheet = XCTAttachment(screenshot: screenshot(app))
        textSheet.name = "Hanori text editor"
        textSheet.lifetime = .keepAlways
        add(textSheet)
        app.buttons["text-done"].tap()

        let preview = app.descendants(matching: .any).matching(identifier: "HanoriSans-Regular-specimen").firstMatch
        XCTAssertTrue(preview.label.contains("Hello from Hanori"))
        app.buttons["appearance"].tap()
        let defaultAppearance = XCTAttachment(screenshot: screenshot(app))
        defaultAppearance.name = "Hanori Appearance"
        defaultAppearance.lifetime = .keepAlways
        add(defaultAppearance)
        app.buttons["language-hint"].tap()
        app.buttons["Japanese"].tap()
        app.sliders["font-size"].adjust(toNormalizedSliderPosition: 0.6)
        let appearance = XCTAttachment(screenshot: screenshot(app))
        appearance.name = "Hanori appearance controls"
        appearance.lifetime = .keepAlways
        add(appearance)
        app.buttons["appearance-done"].tap()
        XCTAssertTrue(app.staticTexts["appearance-summary"].label.contains("Japanese"))
        let result = XCTAttachment(screenshot: screenshot(app))
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
        let sans = XCTAttachment(screenshot: screenshot(app))
        sans.name = "Hanori Sans preview"
        sans.lifetime = .keepAlways
        add(sans)
        #if os(macOS)
        serif.click()
        #else
        serif.tap()
        #endif
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "HanoriSerif-Regular-specimen").firstMatch.waitForExistence(timeout: 5))
        let first = XCTAttachment(screenshot: screenshot(app))
        first.name = "Hanori Serif preview"
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
        let second = XCTAttachment(screenshot: screenshot(app))
        second.name = "Hanori Serif Furigana on device"
        second.lifetime = .keepAlways
        add(second)
    }

    private func screenshot(_ app: XCUIApplication) -> XCUIScreenshot {
        #if os(macOS)
        return app.windows["Hanori Preview"].screenshot()
        #else
        return app.screenshot()
        #endif
    }
}
