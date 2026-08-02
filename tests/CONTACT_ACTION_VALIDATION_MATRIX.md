# Customers/Suppliers Action Validation Matrix

## Shared field contract

| Field | Normalization | Accepted length/format | UI behavior |
| --- | --- | --- | --- |
| Name | trim and collapse whitespace | 2–100 characters | save disabled with a specific reason |
| Phone | Arabic/Persian digits to Latin; remove common separators; normalize Egypt country code | 7–15 digits after normalization | telephone keyboard and a specific error |
| Email | trim, collapse whitespace, lowercase | valid email, maximum 254 characters | custom validation instead of browser-only feedback |
| Address | trim and collapse whitespace | maximum 300 characters | specific field error |
| Notes | trim and collapse whitespace | maximum 1000 characters | specific field error |

Empty optional fields are omitted from mutation payloads. The same shared rules used by Convex are used before customer and supplier mutations.

## Action outcomes

| Action | Success message | Fallback error |
| --- | --- | --- |
| Create customer | تمت إضافة العميل | تعذر إضافة العميل |
| Update customer | تم تحديث بيانات العميل | تعذر تحديث العميل |
| Activate customer | تمت إعادة تفعيل العميل | تعذر إعادة تفعيل العميل |
| Deactivate customer | تم تعطيل العميل | تعذر تعطيل العميل |
| Create supplier | تمت إضافة المورد | تعذر إضافة المورد |
| Update supplier | تم تحديث بيانات المورد | تعذر تحديث المورد |
| Activate supplier | تمت إعادة تفعيل المورد | تعذر إعادة تفعيل المورد |
| Deactivate supplier | تم تعطيل المورد | تعذر تعطيل المورد |

Backend `ConvexError` messages, including duplicate-phone messages, remain authoritative and are displayed through `getErrorMessage`.

## UAT scenarios

1. Enter names and addresses with leading, trailing, and repeated spaces; confirm the saved card displays the normalized value.
2. Enter Arabic or Persian phone digits with spaces, parentheses, dashes, or an Egypt country code; confirm the saved phone is canonical.
3. Leave a required field blank; confirm Save is disabled and the visible reason identifies the first blocking field.
4. Enter an invalid email; confirm a field-level message appears and Save remains disabled.
5. Attempt a duplicate phone for a customer in the same branch or for any supplier; confirm the backend duplicate message is preserved.
6. Confirm a failed create/update leaves the normalized form open for correction.
7. Confirm create, update, activate, and deactivate operations use distinct success and fallback error messages.
8. Confirm closing the modal and branch changes remain blocked while a save is in flight.
