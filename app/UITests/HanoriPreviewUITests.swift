import XCTest

final class HanoriPreviewUITests: XCTestCase {
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
