/**
 * See LICENSE.md for license details.
 */

import SearchSubject from '@netresearch/postdirekt-autocomplete-sdk/src/api/search-subjects';
import ServiceFactory from '@netresearch/postdirekt-autocomplete-sdk/src/service/service-factory';
import SearchServiceInterface from '@netresearch/postdirekt-autocomplete-sdk/src/api/search-service-interface';
import SelectServiceInterface from '@netresearch/postdirekt-autocomplete-sdk/src/api/select-service-interface';
import SearchResponse, { Address } from '@netresearch/postdirekt-autocomplete-sdk/src/model/response/search-response';
import AddressType from '@netresearch/postdirekt-autocomplete-sdk/src/api/address-types';
import AutocompleteAddressSuggestions from './autocomplete-address-suggestions';
import AutocompleteDomAddress from './autocomplete-dom-address';
import ListRenderer from '../view/list-renderer';
import AddressInputType from '../api/address-input-types';

export default class AddressAutocomplete {
    private readonly form: HTMLFormElement;

    private readonly navigationKeyCodes = ['ArrowUp', 'ArrowDown', 'Escape', 'Enter', 'Space', 'Tab'];

    private readonly searchService: SearchServiceInterface;

    private readonly selectService: SelectServiceInterface;

    private readonly inputMap: Map<AddressInputType, HTMLInputElement>;

    private readonly addressSuggestions: AutocompleteAddressSuggestions;

    private readonly domAddress: AutocompleteDomAddress;

    private readonly countrySelect: HTMLInputElement;

    private readonly listRenderer: ListRenderer;

    private readonly deCountryId: string;

    private readonly typingDelay = 500;

    private timeoutId?: number;

    constructor(
        inputMap: Map<AddressInputType, HTMLInputElement>,
        countrySelect: HTMLInputElement,
        deCountryId: string,
        token: string,
    ) {
        this.form = countrySelect.form || new HTMLFormElement();
        this.inputMap = inputMap;
        this.countrySelect = countrySelect;
        this.deCountryId = deCountryId;
        this.searchService = ServiceFactory.createSearchService(token);
        this.selectService = ServiceFactory.createSelectService(token);
        this.addressSuggestions = new AutocompleteAddressSuggestions();
        this.domAddress = new AutocompleteDomAddress(this.inputMap);
        this.listRenderer = new ListRenderer();
    }

    /**
     * Initialize event listeners on the given address DOM inputs elements.
     */
    public start(): void {
        for (const fieldItem of this.inputMap.values()) {
            // Attach event listeners
            fieldItem.addEventListener('keyup', this.handleFieldKeystroke.bind(this));
            fieldItem.addEventListener('autocomplete:datalist-select', this.handleDatalistSelect.bind(this));
        }
        this.countrySelect.addEventListener('change', this.handleCountryChange.bind(this));
        this.form.addEventListener('submit', this.handleFormSubmit.bind(this));

        if (this.deCountryId === this.countrySelect.value
            && (this.domAddress.address.city.length === 0
                || this.domAddress.address.postalCode.length === 0
            )
        ) {
            const streetInput = this.inputMap.get(AddressInputType.Street);
            if (typeof streetInput !== 'undefined') {
                streetInput.disabled = true;
            }
            const houseNumber = this.inputMap.get(AddressInputType.HouseNumber);
            if (typeof houseNumber !== 'undefined') {
                houseNumber.disabled = true;
            }
        }
    }

    /**
     * Handles keystrokes, but does not react to navigation keys.
     */
    public handleFieldKeystroke(e: KeyboardEvent): void {
        if (this.countrySelect.value !== this.deCountryId) {
            return;
        }

        if (!this.navigationKeyCodes.includes(e.code)) {
            this.triggerDelayedCallback(
                () => this.searchAction(e.target as HTMLInputElement),
                this.typingDelay,
            );
        }
    }

    /**
     * Update the DOM input values with the selected address suggestion
     * and perform an API select request.
     */
    public handleDatalistSelect(e: Event): void {
        const field = e.target as HTMLInputElement;
        const uuid = field.dataset.suggestionUuid as string;
        const suggestedAddress = this.addressSuggestions.getByUuid(uuid);

        if (!suggestedAddress) {
            return;
        }

        this.domAddress.address = suggestedAddress;
        const street = this.inputMap.get(AddressInputType.Street);
        const houserNr = this.inputMap.get(AddressInputType.HouseNumber);

        if (
            this.domAddress.address.city.length === 0
            || this.domAddress.address.postalCode.length === 0
        ) {
            if (street !== undefined) {
                street.disabled = true;
            }
            if (houserNr !== undefined) {
                houserNr.disabled = true;
            }
        } else if (street !== undefined) {
            street.disabled = false;
            if (houserNr !== undefined) {
                houserNr.disabled = !this.domAddress.address.street.length;
            }
        }

        this.selectAction(suggestedAddress.uuid);
    }

    /**
     * Remove any existing suggestion list from the DOM if the country is changed away from germany.
     */
    public handleCountryChange(): void {
        if (this.countrySelect.value !== this.deCountryId) {
            this.listRenderer.remove();
            // eslint-disable-next-line no-param-reassign
            this.inputMap.forEach((itm) => { itm.disabled = false; });
        } else if (
            this.domAddress.address.city.length === 0
            || this.domAddress.address.postalCode.length === 0
        ) {
            const street = this.inputMap.get(AddressInputType.Street);
            if (street !== undefined) {
                street.disabled = true;
            }
            const houseNr = this.inputMap.get(AddressInputType.HouseNumber);
            if (houseNr !== undefined) {
                houseNr.disabled = true;
            }
        } else if (
            this.domAddress.address.street.length === 0
        ) {
            const houseNr = this.inputMap.get(AddressInputType.HouseNumber);
            if (houseNr !== undefined) {
                houseNr.disabled = true;
            }
        }
    }

    /**
     * Trigger a given callback with the given delay.
     * If called multiple times, queued callbacks are discarded.
     */
    private triggerDelayedCallback(callback: () => void, delay: number): void {
        // Clear timeout to prevent previous task from execution
        if (typeof this.timeoutId !== undefined) {
            clearTimeout(this.timeoutId);
        }

        this.timeoutId = window.setTimeout(
            callback,
            delay,
        );
    }

    /**
     * Execute a search request at the Autocomplete API,
     * update the AddressSuggestions model,
     * and render a suggestion list in the DOM.
     */
    private searchAction(currentField: HTMLInputElement): void {
        const addressData = this.domAddress.address;
        let subject = SearchSubject.PostalCodesCities;
        if (addressData.houseNumber) {
            subject = SearchSubject.Buildings;
        } else if (addressData.street) {
            subject = SearchSubject.PostalCodesCitiesStreets;
        } else {
            subject = SearchSubject.PostalCodesCities;
        }

        if (Object.values(addressData).join('').trim() === '') {
            return;
        }

        // eslint-disable-next-line prefer-const
        let searchOptions = {
            country: 'de',
            subject: subject,
            combined: Object.values(addressData).join(' '),
            address_type: AddressType.A,
        };


        this.searchService.search(
            this.searchService.requestBuilder.create(
                searchOptions,
            ),
        ).then((response: SearchResponse) => {
            const addresses:Address[]|undefined = response.buildings || response.addresses;

            if (addresses === undefined) {
                return;
            }
            // Map search service response into AddressData array
            // and store them in suggestions model
            this.addressSuggestions.suggestions = addresses
                .filter((address: Address) => !!address.uuid)
                .map(
                    (address: Address) => ({
                        street: address.street || '',
                        postalCode: address.postalCode || '',
                        city: address.city || '',
                        uuid: address.uuid,
                        district: address.district,
                        houseNumber: address.houseNumber || '',
                    }),
                );

            /* Only render anything if the input is still active. */
            if (currentField === document.activeElement) {
                this.listRenderer.render(
                    currentField,
                    this.addressSuggestions.suggestions,
                );
            }
        });
    }

    /**
     * Executes a select request at the Autocomplete API.
     */
    private selectAction(uuid: string): void {
        let req = {
            country: 'de',
            subject: SearchSubject.PostalCodesCitiesStreets,
            uuid,
        };
        if (this.domAddress.address.houseNumber.length !== 0) {
            req.subject = SearchSubject.Buildings
        }
        this.selectService.select(
            this.selectService.requestBuilder.create(req),
        );
    }

    private handleFormSubmit(e: Event): void {
        if (this.deCountryId !== this.countrySelect.value) {
            return ;
        }

        e.preventDefault();
        e.stopPropagation();
        const addr = this.domAddress.address;
        

        if (addr.city.length === 0
            || addr.postalCode.length === 0
            || addr.houseNumber.length === 0
            || addr.street.length === 0
        ) {
            this.form.dispatchEvent(new Event("autocomplete:validation-error", {
                "bubbles": false,
                "cancelable": false,
            }));

            return;
        }


        this.check().then((resp: SearchResponse) => {
            if (!resp.buildings?.length) {
                this.form.dispatchEvent(new Event("autocomplete:validation-error", {
                    "bubbles": false,
                    "cancelable": false,
                }));
                return;
            } else {
                for (let building of resp.buildings) {
                    if (building.city === addr.city
                        && building.postalCode === addr.postalCode
                        && building.street === addr.street
                        // && building.houseNumber === addr.houseNumber
                    ) {
                        this.form.submit();
                        return;
                    }
                }
            }
        });
    }

    private check():Promise<SearchResponse> {
        const addressData = this.domAddress.address;
        return this.searchService.search(
            this.searchService.requestBuilder.create(
                {
                    country: 'de',
                    subject: SearchSubject.Buildings,
                    combined: Object.values(addressData).join(' '),
                    address_type: AddressType.A,
                },
            ),
        );
    }
}
