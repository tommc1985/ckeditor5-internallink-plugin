/**
 * @module internalLink/internalLinkEditing
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import DowncastHelpers from '@ckeditor/ckeditor5-engine/src/conversion/downcasthelpers';
import UpcastHelpers from '@ckeditor/ckeditor5-engine/src/conversion/upcasthelpers';
import { createLinkElement } from './util/utils';
import TwoStepCaretMovement from '@ckeditor/ckeditor5-typing/src/twostepcaretmovement';
import findLinkRange from './util/findlinkrange';

import '../theme/editing.css';

import {
    VIEW_INTERNAL_LINK_TAG,
    VIEW_INTERNAL_LINK_ID_ATTRIBUTE,
    MODEL_INTERNAL_LINK_ID_ATTRIBUTE,
    CLASS_HIGHLIGHT } from './util/constants';

/**
 * The link engine feature.
 *
 * It introduces the `internalLinkId="id"` attribute in the model which renders to
 * the view as a `<internallink internalLinkId="1d">` element.
 *
 * @extends module:core/plugin~Plugin
 */
export default class InternalLinkEditing extends Plugin {
    /**
     * @inheritDoc
     */
    static get requires() {
        return [ TwoStepCaretMovement, DowncastHelpers, UpcastHelpers ];
    }

    /**
     * @inheritDoc
     */
    init() {
        const editor = this.editor;

        // Allow link attribute on all inline nodes.
        editor.model.schema.extend('$text', { allowAttributes: MODEL_INTERNAL_LINK_ID_ATTRIBUTE });

        editor.conversion.for('dataDowncast')
            .attributeToElement({
                model: MODEL_INTERNAL_LINK_ID_ATTRIBUTE,
                view: createLinkElement });

        editor.conversion.for('editingDowncast')
            .attributeToElement({
                model: MODEL_INTERNAL_LINK_ID_ATTRIBUTE,
                view: (internalLinkId, writer) => {
                    return createLinkElement(internalLinkId, writer);
                }
            });

        editor.conversion.for('upcast')
            .elementToAttribute({
                view: {
                    name: VIEW_INTERNAL_LINK_TAG,
                    attributes: {
                        // This is important to ensure that the internal links are not
                        // removed if text with an internal link is pasted to ckeditor
                        [ VIEW_INTERNAL_LINK_ID_ATTRIBUTE ]: true
                    }
                },
                model: {
                    // The internal attribute name
                    key: MODEL_INTERNAL_LINK_ID_ATTRIBUTE,
                    // The html tag attribute
                    value: viewElement => viewElement.getAttribute(VIEW_INTERNAL_LINK_ID_ATTRIBUTE)
                }
            });

        // Enable two-step caret movement for `internalLinkId` attribute.
        const twoStepCaretMovementPlugin = editor.plugins.get( TwoStepCaretMovement );
        twoStepCaretMovementPlugin.registerAttribute( MODEL_INTERNAL_LINK_ID_ATTRIBUTE );

        // Setup highlight over selected link.
        //this.setupLinkHighlight();
    }

    /**
     * Adds a visual highlight style to a link in which the selection is anchored.
     * Together with two-step caret movement, they indicate that the user is typing inside the link.
     *
     * Highlight is turned on by adding `.ck-link_selected` class to the link in the view:
     *
     * * the class is removed before conversion has started, as callbacks added with `'highest'` priority
     * to {@link module:engine/conversion/downcastdispatcher~DowncastDispatcher} events,
     * * the class is added in the view post fixer, after other changes in the model tree were converted to the view.
     *
     * This way, adding and removing highlight does not interfere with conversion.
     *
     * @private
     */
    setupLinkHighlight() {
        const editor = this.editor;
        const view = editor.editing.view;
        const highlightedLinks = new Set();

        // Adding the class.
        view.document.registerPostFixer(writer => {
            const selection = editor.model.document.selection;

            if (selection.hasAttribute(MODEL_INTERNAL_LINK_ID_ATTRIBUTE)) {
                const modelRange = findLinkRange(selection.getFirstPosition(), selection.getAttribute(MODEL_INTERNAL_LINK_ID_ATTRIBUTE), model);
                const viewRange = editor.editing.mapper.toViewRange(modelRange);

                // There might be multiple `a` elements in the `viewRange`, for example, when the `a` element is
                // broken by a UIElement.
                for (const item of viewRange.getItems()) {
                    if (item.is(VIEW_INTERNAL_LINK_TAG)) {
                        writer.addClass(CLASS_HIGHLIGHT, item);
                        highlightedLinks.add(item);
                    }
                }
            }
        });

        // Removing the class.
        editor.conversion.for('editingDowncast').add(dispatcher => {
            // Make sure the highlight is removed on every possible event, before conversion is started.
            dispatcher.on('insert', removeHighlight, { priority: 'highest' });
            dispatcher.on('remove', removeHighlight, { priority: 'highest' });
            dispatcher.on('attribute', removeHighlight, { priority: 'highest' });
            dispatcher.on('selection', removeHighlight, { priority: 'highest' });

            function removeHighlight() {
                view.change(writer => {
                    for (const item of highlightedLinks.values()) {
                        writer.removeClass(CLASS_HIGHLIGHT, item);
                        highlightedLinks.delete(item);
                    }
                });
            }
        });
    }

}
