# Google Maps Takeout Importer

A Chrome extension that imports places from Google Takeout saved-places files and saves them to a list in Google Maps. It processes places one at a time in the active Maps tab.

## Why this project exists

Google Takeout lets you export your saved places, but Google Maps does not provide a way to import those files back into a Maps list. Browser-automation tools such as Playwright can also be blocked when they try to automate import Google Maps.

This extension works as an auto-clicker inside your browser: it opens each place in Google Maps and clicks the controls to save it to your chosen list. That can save a substantial amount of time compared with importing places manually.

## Requirements

- Google Chrome
- A Google Takeout saved-places export in JSON format, or a CSV file with `Title` and `URL` columns
- Google Maps signed in to the account that owns the target list

## Install

1. Download or clone this project.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select the `extension` folder.

## Use

1. Open Google Maps in Chrome and make sure you are signed in.
2. Open the extension and choose your Google Takeout saved-places JSON file, or a compatible CSV file.
3. Enter the target list name exactly as it appears in the Maps interface.
4. Choose **Load & start**. The extension navigates through the places in the current Maps tab and saves each one to the selected list.
5. Use **Stop** to pause the import or **Resume** to continue it.

The importer reverses the order of the places in the selected file before processing them.

### Supported files

- **JSON:** An object with a `features` array. Each feature should have `properties.google_maps_url`; `properties.location.name` or `properties.location.address` is used as the place name when available.
- **CSV:** A header row containing `Title` and `URL` columns. Other columns are ignored. For example:

  ```csv
  Title,URL
  Example place,https://www.google.com/maps/place/Example
  ```

Invalid or missing place URLs are skipped.

## Privacy

The extension has no project backend. The selected file is read by the extension, and the import list and progress are stored in Chrome's local extension storage so that an import can resume.

## Limitations

The extension depends on Google Maps' page structure and button labels, which may change. The save-button labels currently support English and Finnish; other interface languages may require adapting `content.js`.
