/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as React from 'react';
import {ApiService} from '../api-service';
import Autocomplete, {RenderInputParams} from '@material-ui/lab/Autocomplete';
import IconButton from '@material-ui/core/IconButton';
import InputAdornment from '@material-ui/core/InputAdornment';
import SearchIcon from '@material-ui/icons/Search';
import TextField from '@material-ui/core/TextField';

export interface SearchBarProps {
  handleSelectedRelease: (
    selectedRelease: string,
    clearSearchInput: boolean,
  ) => void;
  input: string;
  handleSearchInput: (input: string) => void;
}

export interface SearchBarState {
  releaseNames: string[];
  validSearch: boolean;
}

export class SearchBar extends React.Component<SearchBarProps, SearchBarState> {
  private apiService: ApiService;
  constructor(props: Readonly<SearchBarProps>) {
    super(props);
    this.state = {
      releaseNames: [],
      validSearch: null,
    };
    this.apiService = new ApiService();
    this.onChange = this.onChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
    this.onClose = this.onClose.bind(this);
    this.onInputChange = this.onInputChange.bind(this);
  }

  async componentDidMount(): Promise<void> {
    const releaseNames = await this.apiService.getReleases();
    this.setState({releaseNames});
  }

  shouldComponentUpdate(nextProps: SearchBarProps): boolean {
    return nextProps.input != this.props.input;
  }

  onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
  }

  onClose(_event: React.ChangeEvent<{}>, reason: string): void {
    switch (reason) {
      case 'select-option': {
        this.setState({validSearch: true});
        break;
      }
      case 'create-option': {
        this.setState({validSearch: false});
        break;
      }
    }
  }

  onChange(_event: React.ChangeEvent<{}>, newValue: string | null): void {
    if (this.state.releaseNames.includes(newValue)) {
      this.props.handleSelectedRelease(newValue, false);
    }
  }

  onInputChange(event: React.ChangeEvent<{}>, input: string): void {
    if (input != null) {
      this.props.handleSearchInput(input);
      if (input.length == 0 && event) {
        this.props.handleSelectedRelease(null, false);
      }
    }
    if (this.state.validSearch != null) {
      this.setState({validSearch: null});
    }
  }

  labelText(input: string): string {
    if (this.state.validSearch == null) {
      if (input != null && input?.length != 0) {
        return `${input.length}/13`;
      } else {
        return 'Search for a release...';
      }
    } else {
      if (this.state.validSearch) {
        return 'Selected ✅';
      } else {
        return 'Not Found! 🙈';
      }
    }
  }

  isErrorDisplayed(input: string): boolean {
    if (input?.length > 13) {
      return true;
    }
    return !(input == null || /^\d*$/.test(input));
  }

  render(): JSX.Element {
    return (
      <form onSubmit={this.onSubmit}>
        <Autocomplete
          freeSolo
          value={this.props.input}
          id='release-autocomplete'
          onClose={this.onClose}
          onChange={this.onChange}
          onInputChange={this.onInputChange}
          options={this.state.releaseNames}
          renderInput={(params: RenderInputParams): JSX.Element => (
            <TextField
              {...params}
              size='small'
              error={this.isErrorDisplayed(this.props.input)}
              label={this.labelText(this.props.input)}
              variant='outlined'
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <InputAdornment position='end'>
                    <IconButton type='submit' aria-label='search'>
                      <SearchIcon></SearchIcon>
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          )}
        />
      </form>
    );
  }
}
